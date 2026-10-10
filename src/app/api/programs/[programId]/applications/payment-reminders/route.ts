import { getAppBaseUrl } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { logServerError } from "@/lib/monitoring/log-error";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ReminderBody = { requestId?: string; message?: string };

const awaitingPaymentStatuses = new Set(["checkout_started", "incomplete"]);

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as ReminderBody;
    const customMessage = body.message?.trim();
    if (customMessage && customMessage.length > 1200) {
      return Response.json({ error: "The reminder message is too long." }, { status: 400 });
    }
    const supabase = createSupabaseServiceClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const [decisionAccess, financeAccess] = await Promise.all([
      supabase.rpc("can_decide_program_applications", { check_program_id: programId, check_profile_id: user.id }),
      supabase.rpc("can_manage_program_finances", { check_program_id: programId, check_profile_id: user.id }),
    ]);
    if (decisionAccess.error || financeAccess.error) {
      return Response.json({ error: decisionAccess.error?.message ?? financeAccess.error?.message }, { status: 500 });
    }
    if (!decisionAccess.data && !financeAccess.data) {
      return Response.json({ error: "Application decision or finance access is required to send payment reminders." }, { status: 403 });
    }

    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("id,title,is_paid,mosque_id")
      .eq("id", programId)
      .maybeSingle();
    if (programError || !program) return Response.json({ error: programError?.message ?? "Class not found." }, { status: 404 });
    if (!program.is_paid) return Response.json({ error: "This class does not require payment." }, { status: 409 });

    let requestQuery = supabase
      .from("enrollment_requests")
      .select("id,student_profile_id,parent_profile_id,status,admission_completed_at,payment_bypassed")
      .eq("program_id", programId)
      .eq("status", "approved")
      .is("admission_completed_at", null)
      .eq("payment_bypassed", false);
    if (body.requestId) requestQuery = requestQuery.eq("id", body.requestId);
    const { data: applications, error: applicationsError } = await requestQuery;
    if (applicationsError) return Response.json({ error: applicationsError.message }, { status: 500 });

    const studentIds = (applications ?? []).map((application) => application.student_profile_id);
    const { data: subscriptions, error: subscriptionsError } = studentIds.length
      ? await supabase.from("program_subscriptions").select("student_profile_id,status").eq("program_id", programId).in("student_profile_id", studentIds)
      : { data: [], error: null };
    if (subscriptionsError) return Response.json({ error: subscriptionsError.message }, { status: 500 });
    const subscriptionByStudent = new Map((subscriptions ?? []).map((subscription) => [subscription.student_profile_id, subscription]));
    const eligible = (applications ?? []).filter((application) => {
      const subscription = subscriptionByStudent.get(application.student_profile_id);
      return !subscription || awaitingPaymentStatuses.has(subscription.status?.toLowerCase() ?? "");
    });
    if (body.requestId && !eligible.length) {
      return Response.json({ error: "This application is no longer waiting for payment." }, { status: 409 });
    }

    const { data: mosque } = await supabase.from("mosques").select("slug").eq("id", program.mosque_id).maybeSingle();
    if (!mosque) return Response.json({ error: "Masjid not found." }, { status: 404 });
    const portalPath = `/m/${mosque.slug}/portal/classes?tab=applications`;
    const today = new Date().toISOString().slice(0, 10);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const deliveryReasons = new Set<string>();

    for (const application of eligible) {
      const delivery = await sendProfileNotificationEmails(
        supabase,
        [application.parent_profile_id, application.student_profile_id],
        {
          eventKey: `application-payment-reminder:${application.id}:${today}`,
          subject: `Payment reminder: ${program.title}`,
          title: "Complete Your Registration",
          message: customMessage || `Your application to ${program.title} has been approved and is waiting for payment. Complete payment in Madrasa to finish registration and activate enrollment.`,
          action: { label: "Complete Payment", href: `${getAppBaseUrl()}${portalPath}` },
        },
      );
      sent += delivery.sent;
      skipped += delivery.skipped;
      failed += delivery.failed;
      delivery.reasons.forEach((reason) => deliveryReasons.add(reason));
      await recordFinanceAuditEvent(supabase, {
        programId,
        studentProfileId: application.student_profile_id,
        actorProfileId: user.id,
        eventType: "application_payment_reminder_sent",
        summary: delivery.sent > 0
          ? "A registration payment reminder was sent by email."
          : "A registration payment reminder was attempted, but no new email was sent.",
        metadata: { enrollmentRequestId: application.id, sent: delivery.sent, skipped: delivery.skipped, failed: delivery.failed, reasons: delivery.reasons },
      });
    }

    return Response.json({ ok: true, applications: eligible.length, sent, skipped, failed, reasons: Array.from(deliveryReasons), requestIds: eligible.map((application) => application.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send payment reminders.";
    await logServerError(createSupabaseServiceClient(), { source: "programs.applications.payment-reminders", message });
    return Response.json({ error: message }, { status: 500 });
  }
}
