import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { checkStripeBilling } from "@/lib/finance/check-stripe-billing";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { BillingCheck } from "@/lib/finance/billing-check";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  const { programId } = await params;
  const db = createSupabaseServiceClient();
  try {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return Response.json({ error: "Sign in required." }, { status: 401, headers });
    const access = await requireProgramFinanceAccess(db, programId, user.id);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status, headers });
    const { data: subscriptions, error: readError } = await db.from("program_subscriptions")
      .select("student_profile_id, stripe_subscription_id, stripe_account_id").eq("program_id", programId).limit(501);
    if (readError) throw readError;
    if ((subscriptions?.length ?? 0) > 500) return Response.json({ error: "This class needs a paginated billing review. No students have been marked in order." }, { status: 422, headers });
    const checks: Record<string, BillingCheck> = {};
    const queue = (subscriptions ?? []).filter(row => row.student_profile_id && row.stripe_subscription_id);
    const stripe = queue.length ? getStripe() : null;
    const deadline = Date.now() + 25_000;
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (cursor < queue.length) {
        const row = queue[cursor++];
        try {
          checks[row.student_profile_id!] = await checkStripeBilling(stripe!, row.stripe_subscription_id!, shouldUseStripeConnect() && row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : undefined, deadline);
        } catch {
          checks[row.student_profile_id!] = { group: "review", label: "Could not verify", explanation: "Stripe could not be checked. Refresh before treating this student as in order.", bills: [], checkedAt: new Date().toISOString() };
        }
      }
    }));
    // Stripe checks use the provider's response clock. Keep the batch timestamp
    // consistent with those checks if this host's clock is ahead.
    const checkedAt = new Date(Math.min(Date.now(), ...Object.values(checks).map(check => Date.parse(check.checkedAt)).filter(Number.isFinite))).toISOString();
    return Response.json({ checks, checkedAt }, { headers });
  } catch {
    return Response.json({ error: "Payment checks are unavailable. No students have been marked in order. Please refresh." }, { status: 503, headers });
  }
}
