import { getStripe, shouldUseStripeConnect } from "@/lib/stripe/server";
import { getCheckoutOrigin, getPortalReturnPath } from "@/lib/stripe/checkout-url";
import { isActiveStripeSubscriptionStatus } from "@/lib/stripe/subscriptions";
import { monthlyBillingAnchor } from "@/lib/stripe/billing-anchor";
import { requireProgramFinanceAccess } from "@/lib/finance/auth";
import { recordFinanceAuditEvent } from "@/lib/finance/audit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

type ChangePriceRequestBody = {
  studentProfileId?: string;
  amountCents?: number;
  billingMode?: "monthly" | "annual";
  note?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as ChangePriceRequestBody;
    if (!body.studentProfileId) {
      return Response.json({ error: "Missing student." }, { status: 400 });
    }
    const billingMode = body.billingMode === "annual" ? "annual" : "monthly";
    const amountCents = Math.round(body.amountCents ?? 0);
    if (!amountCents || amountCents < 50) {
      return Response.json({ error: "Enter a valid price." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const access = await requireProgramFinanceAccess(supabase, programId, user.id);
    if (!access.ok) {
      return Response.json({ error: access.error }, { status: access.status });
    }

    const { data: program, error: programError } = await supabase.from("programs").select("*").eq("id", programId).maybeSingle();
    if (programError || !program) {
      return Response.json({ error: programError?.message ?? "Class not found." }, { status: 404 });
    }
    if (!program.stripe_product_id) {
      return Response.json({ error: "Stripe is not configured for this class yet." }, { status: 409 });
    }

    const { data: mosque, error: mosqueError } = await supabase.from("mosques").select("*").eq("id", program.mosque_id).maybeSingle();
    if (mosqueError || !mosque) {
      return Response.json({ error: mosqueError?.message ?? "Masjid not found." }, { status: 404 });
    }

    const { data: existingSubscription } = await supabase
      .from("program_subscriptions")
      .select("*")
      .eq("program_id", programId)
      .eq("student_profile_id", body.studentProfileId)
      .maybeSingle();

    if (existingSubscription?.stripe_subscription_id && isActiveStripeSubscriptionStatus(existingSubscription.status)) {
      return Response.json(
        {
          error:
            "This student already has an active subscription. End the current subscription before sending a new payment setup to avoid double billing.",
        },
        { status: 409 },
      );
    }

    const [{ data: link }, { data: student }, { data: fallbackRequest }] = await Promise.all([
      supabase
        .from("parent_child_links")
        .select("parent_profile_id")
        .eq("mosque_id", program.mosque_id)
        .eq("child_profile_id", body.studentProfileId)
        .maybeSingle(),
      supabase.from("profiles").select("full_name, email").eq("id", body.studentProfileId).maybeSingle(),
      existingSubscription?.enrollment_request_id
        ? Promise.resolve({ data: null })
        : supabase
            .from("enrollment_requests")
            .select("id")
            .eq("program_id", programId)
            .eq("student_profile_id", body.studentProfileId)
            .eq("status", "approved")
            .order("reviewed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    const parentProfileId = link?.parent_profile_id ?? existingSubscription?.parent_profile_id ?? null;
    const { data: parent } = parentProfileId
      ? await supabase.from("profiles").select("full_name, email").eq("id", parentProfileId).maybeSingle()
      : { data: null };
    const enrollmentRequestId = existingSubscription?.enrollment_request_id ?? fallbackRequest?.id ?? null;

    const stripeRequestOptions = shouldUseStripeConnect() && mosque.stripe_account_id ? { stripeAccount: mosque.stripe_account_id } : undefined;
    const stripe = getStripe();
    const now = new Date().toISOString();
    const note = body.note?.trim() || null;
    // "annual" means two different things depending on program duration, mirroring
    // src/lib/finance/payment-terms.ts::paymentTypeFor: a genuine recurring yearly Stripe
    // subscription for an ongoing program, or a one-time pay-in-full lump sum for a
    // fixed-duration program.
    const isRecurringAnnual = billingMode === "annual" && Boolean(program.is_ongoing);
    const paymentTermsType = billingMode === "monthly" ? "monthly" : isRecurringAnnual ? "annual" : "pay_in_full";
    const billingMonths =
      billingMode === "monthly" && program.billing_end_behavior === "fixed_months"
        ? program.billing_duration_months ?? program.duration_months ?? null
        : null;

    await supabase
      .from("program_payment_terms")
      .update({ status: "superseded", updated_at: now })
      .eq("program_id", programId)
      .eq("student_profile_id", body.studentProfileId)
      .not("status", "in", "(superseded,cancelled,ended)");

    const isRecurring = billingMode === "monthly" || isRecurringAnnual;
    const recurringInterval: "month" | "year" = billingMode === "monthly" ? "month" : "year";

    const { data: terms, error: termsError } = await supabase
      .from("program_payment_terms")
      .insert({
        mosque_id: program.mosque_id,
        program_id: programId,
        enrollment_request_id: enrollmentRequestId,
        student_profile_id: body.studentProfileId,
        parent_profile_id: parentProfileId,
        payment_type: paymentTermsType,
        amount_cents: amountCents,
        currency: "cad",
        billing_months: billingMonths,
        billing_start_behavior: billingMode === "monthly" ? program.billing_start_behavior ?? "on_payment" : "not_applicable",
        monthly_billing_anchor: billingMode === "monthly" ? program.monthly_billing_anchor : "signup_date",
        monthly_billing_timezone: program.schedule_timezone,
        billing_end_behavior: billingMode === "monthly" ? (billingMonths ? "fixed_month_count" : "ongoing_until_cancelled") : isRecurringAnnual ? "ongoing_until_cancelled" : "not_applicable",
        program_start_date_snapshot: program.start_date ?? null,
        program_end_date_snapshot: program.end_date ?? null,
        status: "checkout_pending",
        approved_by: user.id,
        approved_at: now,
        internal_note: note,
        updated_at: now,
      })
      .select("*")
      .single();
    if (termsError || !terms) {
      return Response.json({ error: termsError?.message ?? "Could not create payment terms." }, { status: 500 });
    }

    const dynamicPrice = await stripe.prices.create(
      {
        product: program.stripe_product_id,
        currency: "cad",
        unit_amount: amountCents,
        ...(isRecurring ? { recurring: { interval: recurringInterval } } : {}),
        metadata: {
          payment_terms_id: terms.id,
          program_id: programId,
          mosque_id: program.mosque_id,
          student_profile_id: body.studentProfileId,
          payment_type: billingMode === "monthly" ? "monthly" : "annual",
          billing_months: billingMonths ? String(billingMonths) : "",
          billing_end_behavior: terms.billing_end_behavior,
          changed_by_profile_id: user.id,
        },
      },
      stripeRequestOptions,
    );

    const origin = getCheckoutOrigin(request);
    const returnPath = getPortalReturnPath(origin, mosque.slug);
    const checkoutMetadata = {
      payment_terms_id: terms.id,
      enrollment_request_id: enrollmentRequestId ?? "",
      program_id: programId,
      mosque_id: program.mosque_id,
      student_profile_id: body.studentProfileId,
      parent_profile_id: parentProfileId ?? "",
      stripe_account_id: mosque.stripe_account_id,
      payment_type: billingMode === "monthly" ? "monthly" : "annual",
      billing_months: billingMonths ? String(billingMonths) : "",
      billing_end_behavior: terms.billing_end_behavior,
      stripe_price_id: dynamicPrice.id,
    };
    const billingAnchor = billingMode === "monthly" ? monthlyBillingAnchor(program) : undefined;

    const session = await stripe.checkout.sessions.create(
      {
        mode: isRecurring ? "subscription" : "payment",
        line_items: [{ price: dynamicPrice.id, quantity: 1 }],
        customer_email: parent?.email ?? student?.email ?? undefined,
        success_url: `${origin}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${returnPath}?payment=cancelled`,
        ...(isRecurring ? { subscription_data: { metadata: checkoutMetadata, ...(billingAnchor ? { billing_cycle_anchor: billingAnchor, proration_behavior: "create_prorations" as const } : {}) } } : {}),
        metadata: checkoutMetadata,
      },
      stripeRequestOptions,
    );

    await supabase.from("program_subscriptions").upsert(
      {
        mosque_id: program.mosque_id,
        program_id: programId,
        student_profile_id: body.studentProfileId,
        parent_profile_id: parentProfileId,
        enrollment_request_id: enrollmentRequestId,
        payment_terms_id: terms.id,
        stripe_account_id: mosque.stripe_account_id,
        stripe_checkout_session_id: session.id,
        stripe_price_id: dynamicPrice.id,
        payment_type: billingMode === "monthly" ? "monthly" : "annual",
        amount_cents: amountCents,
        billing_months: billingMonths,
        currency: "cad",
        status: "checkout_started",
        payment_paused: false,
        payment_paused_until: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "program_id,student_profile_id" },
    );

    await supabase
      .from("program_payment_terms")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", terms.id);

    await recordFinanceAuditEvent(supabase, {
      programId,
      studentProfileId: body.studentProfileId,
      actorProfileId: user.id,
      eventType: "price_changed",
      summary: `New checkout link sent to ${student?.full_name || student?.email || "this student"} for ${(amountCents / 100).toFixed(2)} CAD (${billingMode === "monthly" ? "monthly" : isRecurringAnnual ? "annual subscription" : "pay in full"}).${note ? ` Note: ${note}` : ""}`,
      metadata: { paymentTermsId: terms.id, amountCents, billingMode, billingMonths, stripePriceId: dynamicPrice.id, checkoutSessionId: session.id, note },
    });

    return Response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not change price.";
    await logServerError(createSupabaseServiceClient(), {
      source: "programs.finance.change-price",
      message,
      context: { ...(await params) },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
