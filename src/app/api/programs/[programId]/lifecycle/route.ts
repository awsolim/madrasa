import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireProgramManageAccess } from "@/lib/programs/auth";
import { asPlanJson, notifyClassLifecycle, previewClassLifecycle, processClassLifecycle } from "@/lib/programs/lifecycle";
import type { ClassLifecycleAction } from "@/lib/programs/lifecycle-policy";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type Body = { mode?: "preview" | "start" | "continue" | "notify"; action?: ClassLifecycleAction; lastAccessDay?: string; reason?: string; hash?: string; operationId?: string; confirm?: boolean };

async function authorize(request: Request, programId: string) {
  const db = createSupabaseServiceClient();
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { error: "Log in required.", status: 401 } as const;
  const access = await requireProgramManageAccess(db, programId, data.user.id);
  if (!access.ok) return access;
  return { db, userId: data.user.id };
}

export async function GET(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const auth = await authorize(request, programId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const [program, operations] = await Promise.all([
    auth.db.from("programs").select("id,title,lifecycle_status,publication_status,access_ends_at,lifecycle_operation_id,schedule_timezone").eq("id", programId).single(),
    auth.db.from("program_lifecycle_operations").select("*").eq("program_id", programId).order("created_at", { ascending: false }).limit(5),
  ]);
  if (program.error || operations.error) return Response.json({ error: program.error?.message || operations.error?.message }, { status: 500 });
  return Response.json({ program: program.data, operations: operations.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const auth = await authorize(request, programId);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json() as Body;
    if (body.mode === "continue" || body.mode === "notify") {
      if (!body.operationId) return Response.json({ error: "Missing class operation." }, { status: 400 });
      const op = await auth.db.from("program_lifecycle_operations").select("id").eq("id", body.operationId).eq("program_id", programId).single();
      if (op.error || !op.data) return Response.json({ error: "Class operation not found." }, { status: 404 });
      if (body.mode === "notify") {
        await notifyClassLifecycle(auth.db, op.data.id);
        return Response.json({ done: true });
      }
      const result = await processClassLifecycle(auth.db, op.data.id, programId);
      return Response.json(result);
    }
    if (!["pause", "resume", "end", "archive"].includes(body.action ?? "")) return Response.json({ error: "Choose a class action." }, { status: 400 });
    const preview = await previewClassLifecycle(auth.db, programId, body.action!, body.lastAccessDay || "now", body.reason || "");
    if (body.mode === "preview") return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
    if (body.mode !== "start" || !body.confirm || body.hash !== preview.hash) return Response.json({ error: "Class or billing information changed. Review a fresh preview before confirming." }, { status: 409 });
    if (preview.plan.blockers.length) return Response.json({ error: preview.plan.blockers.join(" ") }, { status: 409 });
    const { data, error } = await auth.db.rpc("begin_program_lifecycle_operation", { p_program_id: programId, p_actor: auth.userId, p_plan: asPlanJson(preview.plan) });
    if (error) throw error;
    return Response.json({ operationId: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "Could not update class.");
    await logServerError(auth.db, { source: "program.lifecycle", message, context: { programId } });
    return Response.json({ error: message }, { status: 409 });
  }
}
