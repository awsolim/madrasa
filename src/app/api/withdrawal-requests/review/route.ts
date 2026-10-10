import { cancelProgramSubscription } from "@/lib/stripe/subscriptions";
import { sendPushNotification } from "@/lib/push/send-push";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAppBaseUrl } from "@/lib/email/resend";
import { sendProfileNotificationEmails } from "@/lib/email/notifications";
import { logServerError } from "@/lib/monitoring/log-error";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";

export const runtime = "nodejs";

type ReviewWithdrawalBody = {
  withdrawalRequestId?: string;
  status?: "approved" | "rejected";
  refundAmountCents?: number;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as ReviewWithdrawalBody;
    if (!body.withdrawalRequestId || !body.status) {
      return Response.json({ error: "Missing withdrawal review details." }, { status: 400 });
    }

    if (!["approved", "rejected"].includes(body.status)) {
      return Response.json({ error: "Invalid withdrawal decision." }, { status: 400 });
    }
    const refundAmountCents = Math.round(Number(body.refundAmountCents ?? 0));
    if (!Number.isFinite(refundAmountCents) || refundAmountCents < 0) {
      return Response.json({ error: "Refund amount is invalid." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: withdrawalRequest, error: requestError } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", body.withdrawalRequestId)
      .maybeSingle();

    if (requestError || !withdrawalRequest) {
      return Response.json({ error: requestError?.message ?? "Withdrawal request not found." }, { status: 404 });
    }

    if (withdrawalRequest.status !== "pending") {
      return Response.json({ error: "This withdrawal request has already been reviewed." }, { status: 409 });
    }

    const { data: canManage, error: manageError } = await supabase.rpc("can_manage_program", {
      check_program_id: withdrawalRequest.program_id,
      check_profile_id: user.id,
    });

    if (manageError || !canManage) {
      return Response.json({ error: manageError?.message ?? "You cannot review this withdrawal request." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: program } = await supabase.from("programs").select("title, mosque_id").eq("id", withdrawalRequest.program_id).maybeSingle();
    const { data: mosque } = program ? await supabase.from("mosques").select("slug").eq("id", program.mosque_id).maybeSingle() : { data: null };

    if (body.status === "rejected") {
      const { error: updateError } = await supabase
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: now,
          decision_note: "Withdrawal rejected. Enrollment remains active.",
        })
        .eq("id", withdrawalRequest.id);

      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }

      if (program && mosque) {
        const message = `Your withdrawal request for ${program.title} was rejected. Enrollment remains active.`;
        void sendPushNotification(supabase, {
          recipientProfileIds: [withdrawalRequest.parent_profile_id, withdrawalRequest.student_profile_id],
          title: "Withdrawal request rejected",
          body: message,
          url: `/m/${mosque.slug}/portal/classes`,
        });
        await sendProfileNotificationEmails(supabase, [withdrawalRequest.parent_profile_id, withdrawalRequest.student_profile_id], {
          eventKey: `withdrawal-reviewed:${withdrawalRequest.id}:rejected`,
          subject: `Withdrawal request update: ${program.title}`,
          title: "Withdrawal Request Rejected",
          message,
          action: { label: "Open Classes", href: `${getAppBaseUrl()}/m/${mosque.slug}/portal/classes` },
        }).catch(() => null);
      }

      return Response.json({ ok: true });
    }

    const { data: subscription } = await supabase
      .from("program_subscriptions")
      .select("*")
      .eq("program_id", withdrawalRequest.program_id)
      .eq("student_profile_id", withdrawalRequest.student_profile_id)
      .maybeSingle();

    if (refundAmountCents > 0) {
      const { data: canManageFinances, error: financeAccessError } = await supabase.rpc("can_manage_program_finances", {
        check_program_id: withdrawalRequest.program_id,
        check_profile_id: user.id,
      });
      if (financeAccessError || !canManageFinances) {
        return Response.json({ error: financeAccessError?.message ?? "Finance access is required to issue a refund." }, { status: 403 });
      }
    }

    await cancelProgramSubscription(supabase, subscription);

    let refundId: string | null = null;
    if (refundAmountCents > 0) {
      const { data: payment, error: paymentError } = await supabase
        .from("program_payments")
        .select("id,amount_cents,currency,stripe_charge_id,stripe_payment_intent_id,stripe_invoice_id")
        .eq("program_id", withdrawalRequest.program_id)
        .eq("student_profile_id", withdrawalRequest.student_profile_id)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (paymentError || !payment) throw new Error(paymentError?.message ?? "No refundable payment was found for this student.");
      if (refundAmountCents > payment.amount_cents) throw new Error("The refund cannot exceed the student's latest recorded payment.");
      if (!payment.stripe_charge_id && !payment.stripe_payment_intent_id) throw new Error("The latest payment is not linked to a refundable Stripe charge.");
      const stripeOptions = shouldUseStripeConnect() && subscription?.stripe_account_id ? { stripeAccount: subscription.stripe_account_id } : undefined;
      const refund = await getStripe().refunds.create({
        ...(payment.stripe_charge_id ? { charge: payment.stripe_charge_id } : { payment_intent: payment.stripe_payment_intent_id! }),
        amount: refundAmountCents,
        reason: "requested_by_customer",
        metadata: { withdrawal_request_id: withdrawalRequest.id, program_id: withdrawalRequest.program_id, student_profile_id: withdrawalRequest.student_profile_id, program_payment_id: payment.id },
      }, { ...stripeOptions, idempotencyKey: `withdrawal-refund:${withdrawalRequest.id}:${refundAmountCents}` });
      refundId = refund.id;
      await recordFinanceAuditEvent(supabase, {
        programId: withdrawalRequest.program_id,
        studentProfileId: withdrawalRequest.student_profile_id,
        actorProfileId: user.id,
        eventType: "withdrawal_refund_issued",
        summary: `A ${payment.currency.toUpperCase()} ${(refundAmountCents / 100).toFixed(2)} refund was issued when the withdrawal was approved.`,
        metadata: { withdrawalRequestId: withdrawalRequest.id, programPaymentId: payment.id, stripeRefundId: refund.id, amountCents: refundAmountCents, currency: payment.currency },
      });
    }

    const { error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: now,
        decision_note: refundAmountCents > 0 ? `Withdrawal approved. Enrollment ended immediately and a ${(refundAmountCents / 100).toFixed(2)} refund was issued.` : "Withdrawal approved. Enrollment ended immediately without a refund.",
      })
      .eq("id", withdrawalRequest.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    const { error: enrollmentUpdateError } = await supabase
      .from("enrollments")
      .update({ status: "withdrawn" })
      .eq("program_id", withdrawalRequest.program_id)
      .eq("student_profile_id", withdrawalRequest.student_profile_id);

    if (enrollmentUpdateError) {
      return Response.json({ error: enrollmentUpdateError.message }, { status: 500 });
    }

    if (program && mosque) {
      const message = `Your withdrawal request for ${program.title} was approved. Enrollment has ended.${refundAmountCents > 0 ? ` A ${(refundAmountCents / 100).toFixed(2)} refund was issued to the original payment method.` : ""}`;
      void sendPushNotification(supabase, {
        recipientProfileIds: [withdrawalRequest.parent_profile_id, withdrawalRequest.student_profile_id],
        title: "Withdrawal request approved",
        body: message,
        url: `/m/${mosque.slug}/portal/classes`,
      });
      await sendProfileNotificationEmails(supabase, [withdrawalRequest.parent_profile_id, withdrawalRequest.student_profile_id], {
        eventKey: `withdrawal-reviewed:${withdrawalRequest.id}:approved`,
        subject: `Withdrawal request approved: ${program.title}`,
        title: "Withdrawal Request Approved",
        message,
        action: { label: "Open Classes", href: `${getAppBaseUrl()}/m/${mosque.slug}/portal/classes` },
      }).catch(() => null);
    }

    return Response.json({ ok: true, refundId, refundAmountCents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not review withdrawal request.";
    await logServerError(createSupabaseServiceClient(), {
      source: "withdrawal-requests.review",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
