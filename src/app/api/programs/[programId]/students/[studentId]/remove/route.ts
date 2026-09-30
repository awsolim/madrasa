import { requireProgramEnrollmentAccess } from "@/lib/programs/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isActiveStripeSubscriptionStatus } from "@/lib/stripe/subscriptions";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ programId: string; studentId: string }> }) {
  const { programId, studentId } = await params;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "Log in required." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return Response.json({ error: "Log in required." }, { status: 401 });

  const access = await requireProgramEnrollmentAccess(supabase, programId, user.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const [{ data: program }, { data: enrollment }, { data: subscriptions }, { data: student }, { data: actor }] = await Promise.all([
    supabase.from("programs").select("id, mosque_id, title").eq("id", programId).maybeSingle(),
    supabase.from("enrollments").select("id, status").eq("program_id", programId).eq("student_profile_id", studentId).maybeSingle(),
    supabase.from("program_subscriptions").select("status, payment_paused, payment_waived").eq("program_id", programId).eq("student_profile_id", studentId),
    supabase.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);
  if (!program || !enrollment) return Response.json({ error: "Student enrollment was not found." }, { status: 404 });
  if ((subscriptions ?? []).some((row) => !row.payment_paused && !row.payment_waived && isActiveStripeSubscriptionStatus(row.status))) {
    return Response.json({ error: "End this student's active subscription before removing them from class." }, { status: 409 });
  }

  const { data: link } = await supabase.from("parent_child_links").select("parent_profile_id").eq("child_profile_id", studentId).eq("mosque_id", program.mosque_id).maybeSingle();
  const now = new Date().toISOString();
  const message = body.message?.trim() || `You were removed from ${program.title}.`;
  const { error: updateError } = await supabase.from("enrollments").update({ status: "kicked" }).eq("id", enrollment.id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  const { error: noticeError } = await supabase.from("enrollment_requests").upsert({
    mosque_id: program.mosque_id,
    program_id: programId,
    student_profile_id: studentId,
    parent_profile_id: link?.parent_profile_id ?? null,
    status: "cancelled",
    reviewed_by: user.id,
    reviewed_at: now,
    review_note: message,
    student_dismissed_at: null,
  }, { onConflict: "program_id,student_profile_id" });
  if (noticeError) return Response.json({ error: noticeError.message }, { status: 500 });

  const actorName = actor?.full_name?.trim() || actor?.email?.trim() || "Staff member";
  await supabase.from("program_finance_audit_events").insert({
    program_id: programId,
    student_profile_id: studentId,
    actor_profile_id: user.id,
    event_type: "student_removed",
    summary: `${actorName} removed ${student?.full_name || "Student"} from ${program.title}.`,
    metadata: { message },
  });
  return Response.json({ ok: true });
}
