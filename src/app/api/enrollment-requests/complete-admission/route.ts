import { getProgramEnrollmentRecipientProfileIds } from "@/lib/push/program-recipients";
import { sendPushNotification } from "@/lib/push/send-push";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getTenantAppUrl } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { logServerError } from "@/lib/monitoring/log-error";
import { activateEnrollmentForRequest } from "@/lib/programs/enrollment-activation";

export const runtime = "nodejs";

type CompleteAdmissionBody = {
  enrollmentRequestId?: string;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as CompleteAdmissionBody;
    if (!body.enrollmentRequestId) {
      return Response.json({ error: "Missing enrollment request." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: enrollmentRequest, error: requestError } = await supabase
      .from("enrollment_requests")
      .select("*")
      .eq("id", body.enrollmentRequestId)
      .maybeSingle();

    if (requestError || !enrollmentRequest) {
      return Response.json({ error: requestError?.message ?? "Enrollment request not found." }, { status: 404 });
    }

    const ownsRequest = enrollmentRequest.student_profile_id === user.id || enrollmentRequest.parent_profile_id === user.id;
    if (!ownsRequest) {
      return Response.json({ error: "You cannot complete this admission." }, { status: 403 });
    }

    if (enrollmentRequest.status !== "approved" || !enrollmentRequest.payment_bypassed) {
      return Response.json({ error: "This admission is not approved for payment bypass." }, { status: 409 });
    }

    await activateEnrollmentForRequest(supabase, {
      enrollmentRequestId: enrollmentRequest.id,
      programId: enrollmentRequest.program_id,
      studentProfileId: enrollmentRequest.student_profile_id,
      fallbackTrackId: enrollmentRequest.program_track_id,
    });

    const { data: program } = await supabase
      .from("programs")
      .select("title, mosque_id, director_profile_id, teacher_profile_id")
      .eq("id", enrollmentRequest.program_id)
      .maybeSingle();
    if (program) {
      const { data: mosque } = await supabase.from("mosques").select("slug").eq("id", program.mosque_id).maybeSingle();
      const { data: student } = await supabase.from("profiles").select("full_name, email").eq("id", enrollmentRequest.student_profile_id).maybeSingle();
      const managerIds = await getProgramEnrollmentRecipientProfileIds(supabase, { id: enrollmentRequest.program_id, ...program });
      if (mosque) {
        const studentLabel = student?.full_name || student?.email || "A student";
        const paymentLine = enrollmentRequest.payment_bypass_external ? "Payment is handled outside Madrasa." : enrollmentRequest.payment_type === "free" ? "No payment required." : "Payment waived.";
        const message = `${studentLabel} is now enrolled in ${program.title}. ${paymentLine}`;
      await sendPushNotification(supabase, {
          recipientProfileIds: managerIds,
          title: "Enrollment confirmed",
          body: message,
          url: `/m/${mosque.slug}/teacher/inbox`,
          category: "applications",
        });
        await sendProfileNotificationEmails(supabase, managerIds, {
          includeAdmins: true,
          category: "applications",
          adminAction: { label: "Open Students", href: getTenantAppUrl(mosque.slug, `/admin/programs/${enrollmentRequest.program_id}/students`) },
          eventKey: `registration-completed:${enrollmentRequest.id}`,
          subject: `Enrollment confirmed — ${studentLabel}: ${program.title}`,
          title: "Enrollment confirmed",
          message,
          action: { label: "Open Teacher Inbox", href: getTenantAppUrl(mosque.slug, "/teacher/inbox") },
          replyTo: student?.email ?? null,
        }).catch(() => null);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete admission.";
    await logServerError(createSupabaseServiceClient(), {
      source: "enrollment-requests.complete-admission",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
