-- A program's monthly billing-date policy becomes immutable after its first Stripe
-- subscription. Existing subscriptions are never silently moved by editing the class.
create or replace function public.is_program_billing_policy_locked(check_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_subscriptions ps
    where ps.program_id = check_program_id
      and ps.stripe_subscription_id is not null
  );
$$;

grant execute on function public.is_program_billing_policy_locked(uuid) to authenticated;

create or replace function public.prevent_locked_program_billing_policy_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.monthly_billing_anchor is distinct from old.monthly_billing_anchor
     and public.is_program_billing_policy_locked(old.id) then
    raise exception 'The monthly billing date is locked because recurring billing has already begun for this class.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_locked_program_billing_policy_change on public.programs;
create trigger prevent_locked_program_billing_policy_change
before update of monthly_billing_anchor on public.programs
for each row execute function public.prevent_locked_program_billing_policy_change();
