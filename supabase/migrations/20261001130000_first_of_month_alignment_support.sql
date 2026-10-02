-- Service-role-only helpers for Assiddiq's approved one-time alignment. Stripe is
-- changed first; the successful result is then stored and audited atomically.
create or replace function public.prevent_locked_program_billing_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.monthly_billing_anchor is distinct from old.monthly_billing_anchor
     and public.is_program_billing_policy_locked(old.id)
     and coalesce(current_setting('app.approved_billing_alignment', true), '') <> 'first_of_month' then
    raise exception 'The monthly billing date is locked because recurring billing has already begun for this class.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.finalize_first_of_month_subscription_alignment(
  target_subscription_id uuid,
  target_period_start timestamptz,
  target_period_end timestamptz,
  target_status text,
  target_paid_through timestamptz,
  target_next_charge timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row public.program_subscriptions;
begin
  select * into v_row from public.program_subscriptions where id = target_subscription_id for update;
  if v_row.id is null then raise exception 'Subscription record not found.'; end if;
  update public.program_subscriptions
  set current_period_start = target_period_start, current_period_end = target_period_end,
      status = target_status, updated_at = now()
  where id = target_subscription_id;
  if v_row.payment_terms_id is not null then
    update public.program_payment_terms
    set current_period_start = target_period_start, current_period_end = target_period_end, updated_at = now()
    where id = v_row.payment_terms_id;
  end if;
  insert into public.program_finance_audit_events(program_id, student_profile_id, actor_profile_id, event_type, summary, metadata)
  values (v_row.program_id, v_row.student_profile_id, null, 'billing_aligned_to_first_of_month',
    'Monthly billing was aligned to the first of the month without changing the already paid period.',
    jsonb_build_object('stripe_subscription_id', v_row.stripe_subscription_id, 'previous_paid_through', target_paid_through, 'next_charge', target_next_charge));
end;
$$;

create or replace function public.set_program_first_of_month_after_alignment(target_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.approved_billing_alignment', 'first_of_month', true);
  update public.programs set monthly_billing_anchor = 'first_of_month', updated_at = now() where id = target_program_id;
end;
$$;

revoke all on function public.finalize_first_of_month_subscription_alignment(uuid, timestamptz, timestamptz, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.set_program_first_of_month_after_alignment(uuid) from public, anon, authenticated;
grant execute on function public.finalize_first_of_month_subscription_alignment(uuid, timestamptz, timestamptz, text, timestamptz, timestamptz) to service_role;
grant execute on function public.set_program_first_of_month_after_alignment(uuid) to service_role;
