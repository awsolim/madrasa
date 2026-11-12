-- Existing class permissions govern this read surface. Requests remain visible
-- here regardless of whether their inbox notification has been read/dismissed.
create or replace function public.get_program_withdrawals(
  p_program_id uuid, p_reviewed boolean default false, p_offset integer default 0, p_request_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_result jsonb; v_finances boolean;
begin
  if auth.uid() is null or not coalesce(public.can_manage_program_enrollments(p_program_id, auth.uid()), false) then
    return jsonb_build_object('hasAccess', false, 'requests', '[]'::jsonb, 'pendingStudentIds', '[]'::jsonb, 'pendingCount', 0, 'total', 0);
  end if;
  v_finances := coalesce(public.can_manage_program_finances(p_program_id, auth.uid()), false);
  with requests as materialized (
    select w.* from public.withdrawal_requests w where w.program_id = p_program_id
  ), filtered as (
    select * from requests where (status <> 'pending') = coalesce(p_reviewed, false)
  ), page as (
    select * from filtered order by requested_at desc, id desc offset greatest(coalesce(p_offset, 0), 0) limit 50
  ), selected_rows as (
    select * from page union select * from requests where id = p_request_id
  ), formatted as (
    select w.id, w.requested_at, jsonb_build_object(
      'id', w.id, 'studentId', w.student_profile_id, 'studentName', coalesce(student.full_name, 'Student'),
      'parentName', parent.full_name, 'requestedAt', w.requested_at, 'reason', w.reason,
      'status', w.status, 'reviewedAt', w.reviewed_at, 'reviewedBy', reviewer.full_name, 'decisionNote', w.decision_note,
      'hasSubscription', case when v_finances then sub.stripe_subscription_id is not null and sub.status not in ('canceled', 'cancelled', 'incomplete_expired') else null end,
      'paymentType', case when v_finances then sub.payment_type else null end,
      'latestPaymentCents', case when v_finances then payment.amount_cents else null end,
      'currency', case when v_finances then coalesce(payment.currency, 'cad') else null end) as record
    from selected_rows w
    left join public.profiles student on student.id = w.student_profile_id
    left join public.profiles parent on parent.id = w.parent_profile_id
    left join public.profiles reviewer on reviewer.id = w.reviewed_by
    left join lateral (
      select stripe_subscription_id, status, payment_type from public.program_subscriptions
      where program_id = p_program_id and student_profile_id = w.student_profile_id order by updated_at desc limit 1
    ) sub on true
    left join lateral (
      select amount_cents, currency from public.program_payments
      where program_id = p_program_id and student_profile_id = w.student_profile_id order by paid_at desc, id desc limit 1
    ) payment on true
  )
  select jsonb_build_object(
    'hasAccess', true, 'canRefund', v_finances,
    'pendingCount', (select count(*) from requests where status = 'pending'),
    'pendingStudentIds', coalesce((select jsonb_agg(distinct student_profile_id) from requests where status = 'pending'), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'pendingRequestIds', coalesce((select jsonb_object_agg(student_profile_id::text, id::text order by requested_at, id) from requests where status = 'pending'), '{}'::jsonb),
    'requests', coalesce((select jsonb_agg(record order by requested_at desc, id desc) from formatted where id in (select id from page)), '[]'::jsonb),
    'selectedRequest', (select record from formatted where id = p_request_id)
  ) into v_result;
  return v_result;
end;
$$;

-- Counts are distinct concepts: all application records and pending decisions.
-- Return aggregates only, with enrollment permissions controlling withdrawals.
create or replace function public.get_class_action_counts(p_slug text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then return '{}'::jsonb; end if;
  with programs as materialized (
    select p.id,
      coalesce(public.can_view_program_applications(p.id, auth.uid()), false)
        or coalesce(public.can_decide_program_applications(p.id, auth.uid()), false) as applications,
      coalesce(public.can_manage_program_enrollments(p.id, auth.uid()), false) as enrollments
    from public.programs p join public.mosques m on m.id = p.mosque_id
    where m.slug = p_slug
  )
  select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
    'applications', case when p.applications then (select count(*) from public.enrollment_requests r where r.program_id = p.id) else null end,
    'pendingApplications', case when p.applications then (select count(*) from public.enrollment_requests r where r.program_id = p.id and r.status = 'pending') else null end,
    'pendingWithdrawals', case when p.enrollments then (select count(*) from public.withdrawal_requests w where w.program_id = p.id and w.status = 'pending') else null end
  )), '{}'::jsonb) into v_result from programs p where p.applications or p.enrollments;
  return v_result;
end;
$$;
revoke all on function public.get_program_withdrawals(uuid, boolean, integer, uuid) from public, anon;
revoke all on function public.get_class_action_counts(text) from public, anon;
grant execute on function public.get_program_withdrawals(uuid, boolean, integer, uuid) to authenticated;
grant execute on function public.get_class_action_counts(text) to authenticated;
