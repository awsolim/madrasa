import { getProgramEnrollmentRecipientProfileIds } from "@/lib/push/program-recipients";
import { sendPushNotification } from "@/lib/push/send-push";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTenantAppUrl } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type NotifyCreatedBody = {
  programId?: string;
  studentProfileId?: string;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as NotifyCreatedBody;
    if (!body.programId || !body.studentProfileId) {
      return Response.json({ error: "Missing withdrawal request details." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: withdrawalRequest } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("program_id", body.programId)
      .eq("student_profile_id", body.studentProfileId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!withdrawalRequest || withdrawalRequest.requested_by !== user.id) {
      return Response.json({ error: "Withdrawal request not found." }, { status: 404 });
    }

    const { data: program } = await supabase
      .from("programs")
      .select("title, mosque_id, director_profile_id, teacher_profile_id")
      .eq("id", body.programId)
      .maybeSingle();
    if (!program) {
      return Response.json({ ok: true });
    }

    const { data: mosque } = await supabase.from("mosques").select("slug").eq("id", program.mosque_id).maybeSingle();
    const { data: student } = await supabase.from("profiles").select("full_name, email").eq("id", body.studentProfileId).maybeSingle();
    const managerIds = await getProgramEnrollmentRecipientProfileIds(supabase, { id: body.programId, ...program });
    if (mosque) {
      const message = `${student?.full_name || student?.email || "A student"} requested to withdraw from ${program.title}.`;
      await sendPushNotification(supabase, {
        recipientProfileIds: managerIds,
        title: "Withdrawal requested",
        body: message,
        url: `/m/${mosque.slug}/teacher/inbox?tab=withdrawals`,
        category: "withdrawals",
      });
      await sendProfileNotificationEmails(supabase, managerIds, {
        includeAdmins: true,
        adminAction: { label: "Review Request", href: getTenantAppUrl(mosque.slug, `/admin/programs/${body.programId}/students`) },
        eventKey: `withdrawal-requested:${withdrawalRequest.id}`,
        category: "withdrawals",
        subject: `Withdrawal requested: ${program.title}`,
        title: "New Withdrawal Request",
        message,
        action: { label: "Review Request", href: getTenantAppUrl(mosque.slug, "/teacher/inbox?tab=withdrawals") },
        replyTo: student?.email ?? null,
      }).catch(() => null);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send withdrawal notification.";
    await logServerError(createSupabaseServiceClient(), {
      source: "withdrawal-requests.notify-created",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
