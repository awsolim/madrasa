import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { checkStripeBilling } from "@/lib/finance/check-stripe-billing";
import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { BillingCheck } from "@/lib/finance/billing-check";
import { billingMonth, mergeBillingMonthChecks, validBillingMonth } from "@/lib/finance/billing-month";

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
    let body: { month?: unknown };
    try { const text = await request.text(); body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: "Invalid billing month." }, { status: 400, headers }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.month !== undefined && !validBillingMonth(body.month))) return Response.json({ error: "Invalid billing month." }, { status: 400, headers });
    const [subscriptionResult, termsResult, programResult] = await Promise.all([
      db.from("program_subscriptions").select("student_profile_id, stripe_subscription_id, stripe_account_id").eq("program_id", programId).limit(501),
      db.from("program_payment_terms").select("student_profile_id, stripe_subscription_id").eq("program_id", programId).limit(5001),
      db.from("programs").select("schedule_timezone").eq("id", programId).maybeSingle(),
    ]);
    if (subscriptionResult.error || termsResult.error || programResult.error || !programResult.data) throw new Error("Billing records unavailable.");
    const subscriptions = subscriptionResult.data;
    const timeZone = programResult.data.schedule_timezone || "UTC";
    if (body.month && body.month > billingMonth(Date.now(), timeZone)) return Response.json({ error: "Choose this month or an earlier month." }, { status: 400, headers });
    if ((termsResult.data?.length ?? 0) > 5000) throw new Error("Billing history exceeds review limit.");
    if ((subscriptions?.length ?? 0) > 500) return Response.json({ error: "This class needs a paginated billing review. No students have been marked in order." }, { status: 422, headers });
    const checks: Record<string, BillingCheck> = {};
    const linked = (subscriptions ?? []).filter(row => row.student_profile_id && row.stripe_subscription_id);
    // Historical terms retain older subscription IDs after a student re-enrolls
    // or changes arrangement. Check them too, within the same authorized class.
    const queue = [...new Map([
      ...linked,
      ...(termsResult.data ?? []).filter(row => row.stripe_subscription_id).map(row => ({ ...row, stripe_account_id: subscriptions?.find(subscription => subscription.student_profile_id === row.student_profile_id)?.stripe_account_id ?? null })),
    ].map(row => [row.stripe_subscription_id!, row])).values()];
    if (queue.length > 500) throw new Error("Too many subscriptions to verify in one request.");
    const byStudent = new Map<string, BillingCheck[]>();
    const stripe = queue.length ? getStripe() : null;
    const deadline = Date.now() + 25_000;
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (cursor < queue.length) {
        const row = queue[cursor++];
        let check: BillingCheck;
        try {
          if (shouldUseStripeConnect() && !row.stripe_account_id) throw new Error("Missing merchant account for historical subscription.");
          check = await checkStripeBilling(stripe!, row.stripe_subscription_id!, shouldUseStripeConnect() && row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : undefined, deadline, body.month ? { value: body.month as string, timeZone } : undefined);
        } catch {
          check = { group: "review", label: "Could not verify", explanation: "Stripe could not be checked. Refresh before treating this student as in order.", bills: [], checkedAt: new Date().toISOString() };
        }
        const student = row.student_profile_id!;
        byStudent.set(student, [...(byStudent.get(student) ?? []), check]);
      }
    }));
    for (const [student, results] of byStudent) checks[student] = mergeBillingMonthChecks(results);
    // Stripe checks use the provider's response clock. Keep the batch timestamp
    // consistent with those checks if this host's clock is ahead.
    const checkedAt = new Date(Math.min(Date.now(), ...Object.values(checks).map(check => Date.parse(check.checkedAt)).filter(Number.isFinite))).toISOString();
    return Response.json({ checks, checkedAt, month: body.month ?? null }, { headers });
  } catch {
    return Response.json({ error: "Payment checks are unavailable. No students have been marked in order. Please refresh." }, { status: 503, headers });
  }
}
