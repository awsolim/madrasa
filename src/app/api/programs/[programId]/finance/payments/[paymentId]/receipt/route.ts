import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { resolveRefundableCharge } from "@/lib/finance/refundable-charge";
import { logServerError } from "@/lib/monitoring/log-error";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ programId: string; paymentId: string }> }) {
  const { programId, paymentId } = await params;
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const supabase = createSupabaseServiceClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const { data: payment, error: paymentError } = await supabase.from("program_payments")
      .select("id,program_id,program_subscription_id,student_profile_id,parent_profile_id,amount_cents,stripe_charge_id,stripe_payment_intent_id,stripe_invoice_id,receipt_url")
      .eq("id", paymentId).eq("program_id", programId).maybeSingle();
    if (paymentError || !payment) return Response.json({ error: "Payment not found." }, { status: 404 });

    const access = await requireProgramFinanceAccess(supabase, programId, user.id);
    const ownsPayment = payment.student_profile_id === user.id || payment.parent_profile_id === user.id;
    if (!access.ok && !ownsPayment) return Response.json({ error: "You do not have access to this receipt." }, { status: 403 });

    const { data: subscription } = payment.program_subscription_id
      ? await supabase.from("program_subscriptions").select("stripe_account_id").eq("id", payment.program_subscription_id).maybeSingle()
      : { data: null };
    const stripeOptions = shouldUseStripeConnect() && subscription?.stripe_account_id ? { stripeAccount: subscription.stripe_account_id } : undefined;

    let receiptUrl: string | null = null;
    try {
      const resolved = await resolveRefundableCharge(getStripe(), payment, stripeOptions);
      receiptUrl = resolved.charge.receipt_url;
      if (payment.stripe_charge_id !== resolved.charge.id || payment.stripe_payment_intent_id !== resolved.paymentIntentId) {
        await supabase.from("program_payments").update({ stripe_charge_id: resolved.charge.id, stripe_payment_intent_id: resolved.paymentIntentId }).eq("id", payment.id);
      }
    } catch {
      // Some invoice payment methods do not expose a Charge receipt.
    }

    if (!receiptUrl && payment.stripe_invoice_id) {
      const invoice = await getStripe().invoices.retrieve(payment.stripe_invoice_id, {}, stripeOptions);
      receiptUrl = invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null;
    }
    if (!receiptUrl) return Response.json({ error: "Stripe does not provide a receipt for this payment." }, { status: 404 });

    if (payment.receipt_url !== receiptUrl) {
      const { error: updateError } = await supabase.from("program_payments").update({ receipt_url: receiptUrl }).eq("id", payment.id);
      if (updateError) throw updateError;
    }
    return Response.json({ url: receiptUrl }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt unavailable.";
    await logServerError(createSupabaseServiceClient(), { source: "programs.finance.payments.receipt", message, context: { programId, paymentId } });
    return Response.json({ error: "Receipt unavailable. Please try again." }, { status: 500 });
  }
}
