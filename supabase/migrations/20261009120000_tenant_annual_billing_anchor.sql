-- Annual renewal alignment is chosen per program before annual billing begins.
-- Existing programs retain anniversary billing except Assiddiq's programs,
-- whose confirmed policy is January 1.
alter table public.programs
  add column if not exists annual_billing_anchor text not null default 'signup_anniversary';

alter table public.programs
  drop constraint if exists programs_annual_billing_anchor_check;

alter table public.programs
  add constraint programs_annual_billing_anchor_check
  check (annual_billing_anchor in ('signup_anniversary', 'first_of_year'));

update public.programs p
set annual_billing_anchor = 'first_of_year', updated_at = now()
from public.mosques m
where m.id = p.mosque_id
  and m.slug = 'assiddiq'
  and p.annual_billing_anchor is distinct from 'first_of_year';

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
  if new.annual_billing_anchor is distinct from old.annual_billing_anchor
     and exists (
       select 1 from public.program_subscriptions ps
       where ps.program_id = old.id
         and ps.payment_type = 'annual'
         and ps.stripe_subscription_id is not null
     )
     and coalesce(current_setting('app.approved_annual_billing_alignment', true), '') <> 'first_of_year' then
    raise exception 'The annual billing date is locked because annual billing has already begun for this class.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_locked_program_billing_policy_change on public.programs;
create trigger prevent_locked_program_billing_policy_change
before update of monthly_billing_anchor, annual_billing_anchor on public.programs
for each row execute function public.prevent_locked_program_billing_policy_change();
