import { requireProgramManageAccess } from "@/lib/programs/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ programId: string; assignmentId: string }> }) {
  try {
    const { programId, assignmentId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const supabase = createSupabaseServiceClient();
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
    const access = await requireProgramManageAccess(supabase, programId, user.id);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    const { data: assignment } = await supabase.from("program_teachers").select("*").eq("id", assignmentId).eq("program_id", programId).eq("role", "instructor").maybeSingle();
    if (!assignment) return Response.json({ error: "Instructor assignment not found." }, { status: 404 });
    if (assignment.teacher_profile_id) await supabase.from("program_instructor_events").insert({ program_id: programId, assignment_id: assignment.id, teacher_profile_id: assignment.teacher_profile_id, event_type: "resigned" });
    const { error } = await supabase.from("program_teachers").delete().eq("id", assignmentId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove instructor." }, { status: 500 });
  }
}
