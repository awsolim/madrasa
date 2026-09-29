import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PaidEnrollmentPayload = {
  enrollmentRequestId: string;
  mosqueId: string;
  programId: string;
  studentProfileId: string;
  parentProfileId: string | null;
  paymentTermsId: string | null;
  stripeAccountId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionScheduleId: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  stripePriceId: string | null;
  paymentType: "monthly" | "annual";
  amountCents: number | null;
  billingMonths: number | null;
  currency: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isRecurring: boolean;
};

export async function finalizePaidEnrollment(
  supabase: SupabaseClient<Database>,
  payload: PaidEnrollmentPayload,
) {
  const { data, error } = await supabase.rpc("finalize_paid_program_enrollment" as never, { p_payload: payload } as never);
  if (error) throw error;
  const result = data as unknown as { subscriptionId?: string; enrollmentId?: string; trackIds?: string[] } | null;
  if (!result?.subscriptionId || !result.enrollmentId) throw new Error("Paid enrollment did not finish saving.");
  return { subscriptionId: result.subscriptionId, enrollmentId: result.enrollmentId, trackIds: result.trackIds ?? [] };
}
