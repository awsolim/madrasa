-- Annual calendar alignment is intentionally paused while the policy is being
-- reconsidered. Existing and new annual subscriptions continue renewing on
-- their individual signup anniversaries. Keep the column for a future reviewed
-- implementation, but remove the active policy and its lock.
do $$
begin
  perform set_config('app.approved_annual_billing_alignment', 'first_of_year', true);

  update public.programs p
  set annual_billing_anchor = 'signup_anniversary', updated_at = now()
  from public.mosques m
  where m.id = p.mosque_id
    and m.slug = 'assiddiq'
    and p.annual_billing_anchor is distinct from 'signup_anniversary';
end;
$$;

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
