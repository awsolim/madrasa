-- Keep the legacy analytics RPC available for older deployments. The new
-- overview returns aggregates only; transaction browsing is searched/paginated.
create or replace function public.get_program_finance_overview(p_program_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
declare
  v_program public.programs;
  v_launch date;
  v_end date;
  v_months jsonb;
  v_payments jsonb;
  v_subscriptions jsonb;
begin
  select * into v_program from public.programs where id = p_program_id;
  if v_program.id is null then return jsonb_build_object('error', 'Class not found.', 'hasAccess', false); end if;
  if not coalesce(public.can_manage_program_finances(p_program_id, auth.uid()), false) then
    return jsonb_build_object('error', null, 'hasAccess', false);
  end if;
  v_launch := coalesce(v_program.start_date, v_program.created_at::date);
  v_end := least(coalesce(v_program.end_date, current_date), current_date);
  select jsonb_build_object(
    'paymentRecordCount', count(*), 'totalCollectedCents', coalesce(sum(amount_cents), 0),
    'collectedThisMonthCents', coalesce(sum(amount_cents) filter (where paid_at >=
      date_trunc('month', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton'), 0)
  ) into v_payments from public.program_payments where program_id = p_program_id;
  select jsonb_build_object(
    'activePaidSubscriptions', count(distinct student_profile_id) filter (where stripe_subscription_id is not null and status in ('active', 'trialing', 'past_due')),
    'projectedMonthlyCents', coalesce(sum(case when payment_type = 'monthly' then amount_cents when payment_type = 'annual' then round(amount_cents / 12.0)::integer else 0 end)
      filter (where status in ('active', 'trialing', 'past_due') and not coalesce(payment_waived, false)), 0),
    'needsAttention', count(distinct student_profile_id) filter (where status in ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')),
    'waivedStudents', count(distinct student_profile_id) filter (where payment_waived = true or payment_type = 'waived')
  ) into v_subscriptions from public.program_subscriptions where program_id = p_program_id;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'amountCents', amount_cents) order by month_start), '[]'::jsonb)
  into v_months from (
    select series.month_start, coalesce(sum(payment.amount_cents), 0) as amount_cents
    from generate_series(date_trunc('year', v_launch::timestamp), date_trunc('year', v_end::timestamp) + interval '11 months', interval '1 month') series(month_start)
    left join public.program_payments payment on payment.program_id = p_program_id
      and payment.paid_at >= series.month_start and payment.paid_at < series.month_start + interval '1 month'
    group by series.month_start
  ) months;
  return v_payments || v_subscriptions || jsonb_build_object(
    'error', null, 'hasAccess', true, 'launchedAt', v_launch, 'reportingEndsAt', v_end,
    'currency', coalesce((select currency from public.program_payments where program_id = p_program_id order by paid_at desc limit 1), 'cad'),
    'activeStudents', (select count(distinct student_profile_id) from public.enrollments where program_id = p_program_id and status = 'active'),
    'pendingApplications', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'pending'),
    'waitlistedStudents', (select count(*) from public.enrollment_requests where program_id = p_program_id and status = 'waitlisted' and student_dismissed_at is null),
    'monthlyRevenue', v_months
  );
end;
$$;

create or replace function public.get_program_finance_transactions(
  p_program_id uuid, p_search text default '', p_offset integer default 0, p_limit integer default 50
)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not coalesce(public.can_manage_program_finances(p_program_id, auth.uid()), false) then
    raise exception 'Finance access required.' using errcode = '42501';
  end if;
  with refunds as (
    -- The same Stripe refund can have more than one audit entry. Count it once.
    select distinct on (coalesce(metadata->>'stripeRefundId', id::text))
      id, student_profile_id, created_at, metadata
    from public.program_finance_audit_events
    where program_id = p_program_id and event_type in ('payment_refund_issued', 'withdrawal_refund_issued')
      and student_profile_id is not null
      and case when metadata->>'amountCents' ~ '^[0-9]+([.][0-9]+)?$'
        then (metadata->>'amountCents')::numeric > 0 else false end
    order by coalesce(metadata->>'stripeRefundId', id::text), created_at desc, id
  ), entries as (
    select id::text, student_profile_id, parent_profile_id, amount_cents::numeric, currency, paid_at
    from public.program_payments where program_id = p_program_id
    union all
    select 'refund:' || r.id::text, r.student_profile_id, payment.parent_profile_id, -(r.metadata->>'amountCents')::numeric,
      coalesce(r.metadata->>'currency', payment.currency, 'cad'), r.created_at
    from refunds r left join public.program_payments payment on payment.id::text = r.metadata->>'programPaymentId' and payment.program_id = p_program_id
  ), named as (
    select e.*, coalesce(student.full_name, 'Student') as student_name, parent.full_name as parent_name
    from entries e left join public.profiles student on student.id = e.student_profile_id
    left join lateral (
      select p.full_name from public.parent_child_links l join public.profiles p on p.id = l.parent_profile_id
      where l.child_profile_id = e.student_profile_id and l.mosque_id = (select mosque_id from public.programs where id = p_program_id)
      order by (l.parent_profile_id = e.parent_profile_id) desc nulls last, l.parent_profile_id limit 1
    ) parent on true
  ), filtered as materialized (
    select * from named where nullif(trim(p_search), '') is null
      or strpos(lower(student_name || ' ' || coalesce(parent_name, '') || ' ' || amount_cents::text || ' ' || paid_at::text
        || case when amount_cents < 0 then ' refund' else ' payment' end), lower(trim(p_search))) > 0
  ), page as (
    select * from filtered order by paid_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0) limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'studentProfileId', student_profile_id, 'studentName', student_name, 'parentName', parent_name,
      'amountCents', amount_cents, 'currency', currency, 'paidAt', paid_at
    ) order by paid_at desc, id desc) from page), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_program_finance_overview(uuid) from public, anon;
revoke all on function public.get_program_finance_transactions(uuid, text, integer, integer) from public, anon;
grant execute on function public.get_program_finance_overview(uuid) to authenticated;
grant execute on function public.get_program_finance_transactions(uuid, text, integer, integer) to authenticated;
