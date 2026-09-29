-- Completes a paid registration as one database transaction. The function is callable
-- only with the service role and validates that the approved request, payment terms,
-- Stripe checkout and recurring/one-time evidence all refer to the same student/class.
create or replace function public.finalize_paid_program_enrollment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests;
  v_terms public.program_payment_terms;
  v_subscription_id uuid;
  v_enrollment_id uuid;
  v_track_ids uuid[];
  v_is_recurring boolean := coalesce((p_payload->>'isRecurring')::boolean, false);
  v_stripe_subscription_id text := nullif(p_payload->>'stripeSubscriptionId', '');
  v_stripe_payment_intent_id text := nullif(p_payload->>'stripePaymentIntentId', '');
  v_stripe_status text := nullif(p_payload->>'status', '');
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  select * into v_request
  from public.enrollment_requests
  where id = (p_payload->>'enrollmentRequestId')::uuid
  for update;

  if v_request.id is null
     or v_request.program_id <> (p_payload->>'programId')::uuid
     or v_request.student_profile_id <> (p_payload->>'studentProfileId')::uuid
     or v_request.status <> 'approved' then
    raise exception 'Approved enrollment request does not match the checkout.';
  end if;

  if nullif(p_payload->>'paymentTermsId', '') is not null then
    select * into v_terms
    from public.program_payment_terms
    where id = (p_payload->>'paymentTermsId')::uuid
      and enrollment_request_id = v_request.id
      and program_id = v_request.program_id
      and student_profile_id = v_request.student_profile_id
    for update;
    if v_terms.id is null then
      raise exception 'Payment terms do not match the enrollment request.';
    end if;
  end if;

  if nullif(p_payload->>'stripeCheckoutSessionId', '') is null then
    raise exception 'A completed Stripe checkout session is required.';
  end if;
  if v_is_recurring and (v_stripe_subscription_id is null or v_stripe_status not in ('active', 'trialing', 'past_due')) then
    raise exception 'A valid Stripe subscription is required for recurring enrollment.';
  end if;
  if not v_is_recurring and v_stripe_payment_intent_id is null then
    raise exception 'A paid Stripe payment intent is required for one-time enrollment.';
  end if;

  select coalesce(array_agg(program_track_id order by program_track_id), array[]::uuid[])
  into v_track_ids
  from public.enrollment_request_tracks
  where enrollment_request_id = v_request.id;
  if cardinality(v_track_ids) = 0 and v_request.program_track_id is not null then
    v_track_ids := array[v_request.program_track_id];
  end if;

  insert into public.program_subscriptions (
    mosque_id, program_id, student_profile_id, parent_profile_id, program_track_id,
    enrollment_request_id, payment_terms_id, stripe_account_id, stripe_customer_id,
    stripe_subscription_id, stripe_subscription_schedule_id, stripe_checkout_session_id,
    stripe_price_id, payment_type, amount_cents, billing_months, currency, status,
    current_period_start, current_period_end, cancel_at_period_end, updated_at
  ) values (
    (p_payload->>'mosqueId')::uuid, v_request.program_id, v_request.student_profile_id,
    nullif(p_payload->>'parentProfileId', '')::uuid, v_track_ids[1], v_request.id, v_terms.id,
    nullif(p_payload->>'stripeAccountId', ''), nullif(p_payload->>'stripeCustomerId', ''),
    v_stripe_subscription_id, nullif(p_payload->>'stripeSubscriptionScheduleId', ''),
    p_payload->>'stripeCheckoutSessionId', nullif(p_payload->>'stripePriceId', ''),
    p_payload->>'paymentType', nullif(p_payload->>'amountCents', '')::integer,
    nullif(p_payload->>'billingMonths', '')::integer, coalesce(nullif(p_payload->>'currency', ''), 'cad'),
    v_stripe_status, nullif(p_payload->>'currentPeriodStart', '')::timestamptz,
    nullif(p_payload->>'currentPeriodEnd', '')::timestamptz,
    coalesce((p_payload->>'cancelAtPeriodEnd')::boolean, false), v_now
  )
  on conflict (program_id, student_profile_id) do update set
    parent_profile_id = excluded.parent_profile_id,
    program_track_id = excluded.program_track_id,
    enrollment_request_id = excluded.enrollment_request_id,
    payment_terms_id = excluded.payment_terms_id,
    stripe_account_id = excluded.stripe_account_id,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_subscription_schedule_id = excluded.stripe_subscription_schedule_id,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_price_id = excluded.stripe_price_id,
    payment_type = excluded.payment_type,
    amount_cents = excluded.amount_cents,
    billing_months = excluded.billing_months,
    currency = excluded.currency,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = excluded.updated_at
  returning id into v_subscription_id;

  delete from public.program_subscription_tracks where program_subscription_id = v_subscription_id;
  insert into public.program_subscription_tracks (program_subscription_id, program_track_id)
  select v_subscription_id, unnest(v_track_ids);

  insert into public.enrollments (program_id, student_profile_id, program_track_id, status, created_at)
  values (v_request.program_id, v_request.student_profile_id, v_track_ids[1], 'active', v_now)
  on conflict (program_id, student_profile_id) do update set
    program_track_id = excluded.program_track_id, status = 'active', created_at = excluded.created_at
  returning id into v_enrollment_id;

  delete from public.enrollment_tracks where enrollment_id = v_enrollment_id;
  insert into public.enrollment_tracks (enrollment_id, program_track_id)
  select v_enrollment_id, unnest(v_track_ids);

  update public.enrollment_requests set
    admission_completed_at = coalesce(admission_completed_at, v_now),
    student_dismissed_at = coalesce(student_dismissed_at, v_now),
    teacher_dismissed_at = null
  where id = v_request.id;

  if v_terms.id is not null then
    update public.program_payment_terms set
      enrollment_id = v_enrollment_id,
      status = case when v_is_recurring then 'active' else 'paid' end,
      stripe_customer_id = nullif(p_payload->>'stripeCustomerId', ''),
      stripe_checkout_session_id = p_payload->>'stripeCheckoutSessionId',
      stripe_subscription_id = v_stripe_subscription_id,
      stripe_subscription_schedule_id = nullif(p_payload->>'stripeSubscriptionScheduleId', ''),
      stripe_payment_intent_id = v_stripe_payment_intent_id,
      current_period_start = nullif(p_payload->>'currentPeriodStart', '')::timestamptz,
      current_period_end = nullif(p_payload->>'currentPeriodEnd', '')::timestamptz,
      updated_at = v_now
    where id = v_terms.id;
  end if;

  return jsonb_build_object('subscriptionId', v_subscription_id, 'enrollmentId', v_enrollment_id, 'trackIds', to_jsonb(v_track_ids));
end;
$$;

revoke all on function public.finalize_paid_program_enrollment(jsonb) from public, anon, authenticated;
grant execute on function public.finalize_paid_program_enrollment(jsonb) to service_role;

-- Free, waived and externally-paid registrations use the same atomic enrollment
-- transition, but are validated against the program/request/terms instead of Stripe.
create or replace function public.finalize_no_payment_program_enrollment(p_enrollment_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.enrollment_requests;
  v_program public.programs;
  v_terms public.program_payment_terms;
  v_enrollment_id uuid;
  v_track_ids uuid[];
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;

  select * into v_request from public.enrollment_requests where id = p_enrollment_request_id for update;
  if v_request.id is null or v_request.status <> 'approved' then
    raise exception 'Approved enrollment request required.';
  end if;
  select * into v_program from public.programs where id = v_request.program_id;
  if v_request.payment_terms_id is not null then
    select * into v_terms from public.program_payment_terms where id = v_request.payment_terms_id for update;
  end if;
  if v_program.is_paid
     and not coalesce(v_request.payment_bypassed, false)
     and coalesce(v_terms.payment_type, '') not in ('free', 'waived')
     and coalesce(v_terms.status, '') <> 'waived' then
    raise exception 'Payment or an explicit waiver is required.';
  end if;

  select coalesce(array_agg(program_track_id order by program_track_id), array[]::uuid[])
  into v_track_ids from public.enrollment_request_tracks where enrollment_request_id = v_request.id;
  if cardinality(v_track_ids) = 0 and v_request.program_track_id is not null then
    v_track_ids := array[v_request.program_track_id];
  end if;

  insert into public.enrollments (program_id, student_profile_id, program_track_id, status, created_at)
  values (v_request.program_id, v_request.student_profile_id, v_track_ids[1], 'active', v_now)
  on conflict (program_id, student_profile_id) do update set
    program_track_id = excluded.program_track_id, status = 'active', created_at = excluded.created_at
  returning id into v_enrollment_id;

  delete from public.enrollment_tracks where enrollment_id = v_enrollment_id;
  insert into public.enrollment_tracks (enrollment_id, program_track_id)
  select v_enrollment_id, unnest(v_track_ids);

  update public.enrollment_requests set admission_completed_at = coalesce(admission_completed_at, v_now),
    student_dismissed_at = coalesce(student_dismissed_at, v_now), teacher_dismissed_at = null
  where id = v_request.id;

  if v_terms.id is not null then
    update public.program_payment_terms set enrollment_id = v_enrollment_id,
      status = case when payment_type = 'waived' then 'waived' else 'active' end,
      updated_at = v_now where id = v_terms.id;
  end if;
  return jsonb_build_object('enrollmentId', v_enrollment_id, 'trackIds', to_jsonb(v_track_ids));
end;
$$;

revoke all on function public.finalize_no_payment_program_enrollment(uuid) from public, anon, authenticated;
grant execute on function public.finalize_no_payment_program_enrollment(uuid) to service_role;

-- Final database guard: a paid class cannot gain a newly-active enrollment unless
-- the registration has an explicit no-payment decision or durable Stripe evidence.
create or replace function public.enforce_active_enrollment_billing_evidence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_paid boolean;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  select is_paid into v_is_paid from public.programs where id = new.program_id;
  if not coalesce(v_is_paid, false) then return new; end if;

  if exists (
    select 1 from public.enrollment_requests r
    left join public.program_payment_terms t on t.id = r.payment_terms_id
    where r.program_id = new.program_id and r.student_profile_id = new.student_profile_id
      and r.status = 'approved'
      and (
        r.payment_bypassed = true
        or t.payment_type in ('free', 'waived')
        or t.status = 'waived'
      )
  ) then return new; end if;

  if exists (
    select 1 from public.program_subscriptions s
    left join public.program_payment_terms t on t.id = s.payment_terms_id
    where s.program_id = new.program_id and s.student_profile_id = new.student_profile_id
      and (
        (s.stripe_subscription_id is not null and s.status in ('active', 'trialing', 'past_due'))
        or (s.status = 'paid' and s.stripe_checkout_session_id is not null
            and coalesce(t.stripe_payment_intent_id, '') <> '')
      )
  ) then return new; end if;

  raise exception 'Paid enrollment requires verified billing evidence or an explicit waiver.';
end;
$$;

drop trigger if exists active_enrollment_billing_evidence_guard on public.enrollments;
create trigger active_enrollment_billing_evidence_guard
before insert or update of status on public.enrollments
for each row execute function public.enforce_active_enrollment_billing_evidence();
