-- Finance overview for authorized program staff. Actual revenue comes only from the
-- durable payment ledger; recurring revenue is a clearly separate projection.
create or replace function public.get_program_finance_analytics(p_program_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_program public.programs;
  v_months jsonb;
  v_transactions jsonb;
  v_current_month_start timestamptz := date_trunc('month', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton';
  v_launch_date date;
  v_reporting_end_date date;
begin
  select * into v_program from public.programs where id = p_program_id;
  if v_program.id is null then
    return jsonb_build_object('error', 'Class not found.', 'hasAccess', false);
  end if;
  if not public.can_manage_program_finances(p_program_id, auth.uid()) then
    return jsonb_build_object('error', null, 'hasAccess', false);
  end if;
  v_launch_date := coalesce(v_program.start_date, v_program.created_at::date);
  v_reporting_end_date := least(coalesce(v_program.end_date, current_date), current_date);

  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(month_start, 'YYYY-MM'),
    'amountCents', coalesce(amount_cents, 0)
  ) order by month_start), '[]'::jsonb)
  into v_months
  from (
    select series.month_start, sum(payments.amount_cents)::bigint as amount_cents
    from generate_series(
      date_trunc('year', v_launch_date::timestamp),
      date_trunc('year', v_reporting_end_date::timestamp) + interval '11 months', interval '1 month'
    ) series(month_start)
    left join public.program_payments payments
      on payments.program_id = p_program_id
      and payments.paid_at >= series.month_start
      and payments.paid_at < series.month_start + interval '1 month'
    group by series.month_start
  ) monthly;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payment.id, 'studentProfileId', payment.student_profile_id, 'studentName', profile.full_name, 'amountCents', payment.amount_cents,
    'currency', payment.currency, 'paidAt', payment.paid_at, 'receiptUrl', payment.receipt_url
  ) order by payment.paid_at desc), '[]'::jsonb)
  into v_transactions
  from public.program_payments payment
  left join public.profiles profile on profile.id = payment.student_profile_id
  where payment.program_id = p_program_id;

  return jsonb_build_object(
    'error', null,
    'hasAccess', true,
    'launchedAt', v_launch_date,
    'reportingEndsAt', v_reporting_end_date,
    'currency', coalesce((select currency from public.program_payments where program_id = p_program_id order by paid_at desc limit 1), 'cad'),
    'paymentRecordCount', (select count(*) from public.program_payments where program_id = p_program_id),
    'totalCollectedCents', coalesce((select sum(amount_cents) from public.program_payments where program_id = p_program_id), 0),
    'collectedThisMonthCents', coalesce((select sum(amount_cents) from public.program_payments where program_id = p_program_id and paid_at >= v_current_month_start), 0),
    'activeStudents', (select count(distinct student_profile_id) from public.enrollments where program_id = p_program_id and status = 'active'),
    'pendingApplications', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'pending'),
    'waitlistedStudents', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'waitlisted' and student_dismissed_at is null),
    'activePaidSubscriptions', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and stripe_subscription_id is not null and status in ('active', 'trialing', 'past_due')),
    'projectedMonthlyCents', coalesce((select sum(case when payment_type = 'monthly' then amount_cents when payment_type = 'annual' then round(amount_cents / 12.0)::integer else 0 end) from public.program_subscriptions where program_id = p_program_id and status in ('active', 'trialing', 'past_due') and not coalesce(payment_waived, false)), 0),
    'needsAttention', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and status in ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')),
    'waivedStudents', (select count(distinct student_profile_id) from public.program_subscriptions where program_id = p_program_id and (payment_waived = true or payment_type = 'waived')),
    'monthlyRevenue', v_months,
    'transactions', v_transactions
  );
end;
$$;

grant execute on function public.get_program_finance_analytics(uuid) to authenticated;
