import { timingSafeEqual } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { processClassLifecycle, notifyClassLifecycle } from "@/lib/programs/lifecycle";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }
  const db = createSupabaseServiceClient();
  const start = Date.now();
  // pg_cron owns access finalization independently of the web deployment.
  // This worker only resumes unfinished operations and delivers notifications.
  const { data: operations, error } = await db.from("program_lifecycle_operations").select("id,program_id,status")
    .or("status.eq.processing,and(status.neq.processing,notifications_sent_at.is.null,action.neq.archive)")
    .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).order("created_at").limit(10);
  if (error) return Response.json({ error: "Could not read class operations." }, { status: 500 });
  let failed = 0;
  for (const op of operations ?? []) {
    if (Date.now() - start > 18000) break;
    try {
      if (op.status === "processing") {
        let result = await processClassLifecycle(db, op.id, op.program_id);
        while (!result.done && Date.now() - start < 18000) result = await processClassLifecycle(db, op.id, op.program_id);
        if (!result.done) continue;
      }
      await notifyClassLifecycle(db, op.id);
    } catch (error) {
      failed++;
      await logServerError(db, { source: "class.lifecycle.maintenance", message: error instanceof Error ? error.message : "Class update needs attention.", context: { operationId: op.id, programId: op.program_id } });
    }
  }
  return Response.json({ checked: operations?.length ?? 0, failed });
}
