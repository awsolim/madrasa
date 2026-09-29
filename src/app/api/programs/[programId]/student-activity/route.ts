import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildStudentTimeline } from "@/lib/student-timeline";

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const db = createSupabaseServiceClient();
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return Response.json({ error: "Please sign in again." }, { status: 401 });
    const { studentProfileId, scope = "finance" } = await request.json();
    if (typeof studentProfileId !== "string" || !/^[a-f0-9-]{36}$/i.test(studentProfileId)) return Response.json({ error: "Invalid student." }, { status: 400 });
    if (scope !== "finance" && scope !== "application") return Response.json({ error: "Invalid activity scope." }, { status: 400 });
    const accessChecks = scope === "finance"
      ? [db.rpc("can_manage_program_finances", { check_program_id: programId, check_profile_id: user.id })]
      : [
          db.rpc("can_view_program_applications", { check_program_id: programId, check_profile_id: user.id }),
          db.rpc("can_decide_program_applications", { check_program_id: programId, check_profile_id: user.id }),
        ];
    const resolvedAccess = await Promise.all(accessChecks);
    if (resolvedAccess.some((result) => result.error)) throw resolvedAccess.find((result) => result.error)?.error;
    if (!resolvedAccess.some((result) => result.data === true)) return Response.json({ error: "You do not have permission to view this activity." }, { status: 403 });

    const [eventsResult, applicationsResult] = await Promise.all([
      db.from("program_finance_audit_events").select("*").eq("program_id", programId).eq("student_profile_id", studentProfileId).order("created_at", { ascending: false }).limit(100),
      db.from("enrollment_requests").select("id, program_id, student_profile_id, parent_profile_id, status, payment_type, requested_at").eq("program_id", programId).eq("student_profile_id", studentProfileId).order("requested_at", { ascending: true }),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (applicationsResult.error) throw applicationsResult.error;
    const profileIds = [...new Set([
      studentProfileId,
      ...(eventsResult.data ?? []).map((event) => event.actor_profile_id),
      ...(applicationsResult.data ?? []).map((application) => application.parent_profile_id),
    ].filter((id): id is string => Boolean(id)))];
    const { data: people, error: peopleError } = profileIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", profileIds)
      : { data: [], error: null };
    if (peopleError) throw peopleError;
    return Response.json({ events: buildStudentTimeline({
      events: eventsResult.data ?? [], applications: applicationsResult.data ?? [], people: people ?? [], scope,
    }) });
  } catch {
    return Response.json({ error: "Activity could not be loaded. Please try again." }, { status: 500 });
  }
}
