-- Security fix: the existing UPDATE policies on enrollment_requests and
-- withdrawal_requests only check row ownership (student_profile_id = auth.uid()
-- or parent_profile_id = auth.uid()), not which columns are being changed. A
-- student or parent can currently call the Supabase REST API directly (with
-- nothing but their own normal session and the public anon key) to PATCH their
-- own enrollment_requests row to {"status":"approved","payment_bypassed":true},
-- which the app's own checkout/confirm flow then trusts (see
-- src/lib/finance/payment-terms.ts), activating enrollment in a paid program
-- with no director review and no payment. The same class of bug lets a
-- student/parent self-approve or self-reject their own withdrawal_requests row,
-- bypassing staff review.
--
-- This is deliberately NOT a restrictive RLS policy, because RLS's WITH CHECK
-- clause only sees the final row state, not which specific columns changed —
-- a plain restrictive policy that required e.g. status IN ('pending','cancelled')
-- would also block the legitimate "dismiss an already-approved/rejected
-- request from my inbox" action, which only touches student_dismissed_at and
-- leaves an already-decided status/reviewed_by alone. A BEFORE UPDATE trigger
-- has access to both OLD and NEW and can express "these specific columns may
-- not move from a non-privileged value to a privileged one" precisely.
--
-- Server-side API routes (approve/reject/waitlist/waive/change-price, and the
-- withdrawal review route) all use the Supabase service-role client, which
-- Postgres reports as auth.role() = 'service_role' regardless of RLS — the
-- trigger explicitly lets that path through untouched, so this only closes the
-- direct-REST-API gap and does not change any existing staff-facing behavior.
-- Non-destructive: adds one trigger function and one trigger per table, no
-- columns, tables, or existing policies are altered.

create or replace function public.enforce_enrollment_request_self_service_update()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.payment_bypassed = true and coalesce(old.payment_bypassed, false) = false then
    raise exception 'Not permitted: payment_bypassed can only be granted by program staff.';
  end if;
  if new.payment_bypass_external = true and coalesce(old.payment_bypass_external, false) = false then
    raise exception 'Not permitted: payment_bypass_external can only be granted by program staff.';
  end if;
  if new.admission_completed_at is not null and old.admission_completed_at is null then
    raise exception 'Not permitted: admission_completed_at can only be set by program staff.';
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'Not permitted: status can only be set to approved by program staff.';
  end if;
  if new.status = 'waitlisted' and old.status is distinct from 'waitlisted' then
    raise exception 'Not permitted: status can only be set to waitlisted by program staff.';
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Not permitted: status can only be set to rejected by program staff.';
  end if;
  if new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'Not permitted: reviewed_by can only be set by program staff.';
  end if;
  if new.approved_price_monthly_cents is not null
     and new.approved_price_monthly_cents is distinct from old.approved_price_monthly_cents then
    raise exception 'Not permitted: approved_price_monthly_cents can only be set by program staff.';
  end if;
  if new.approved_price_annual_cents is not null
     and new.approved_price_annual_cents is distinct from old.approved_price_annual_cents then
    raise exception 'Not permitted: approved_price_annual_cents can only be set by program staff.';
  end if;

  return new;
end;
$$;

drop trigger if exists enrollment_requests_self_service_guard on public.enrollment_requests;
create trigger enrollment_requests_self_service_guard
before update on public.enrollment_requests
for each row
execute function public.enforce_enrollment_request_self_service_update();

create or replace function public.enforce_withdrawal_request_self_service_update()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'Not permitted: status can only be set to approved by program staff.';
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    raise exception 'Not permitted: status can only be set to rejected by program staff.';
  end if;
  if new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'Not permitted: reviewed_by can only be set by program staff.';
  end if;

  return new;
end;
$$;

drop trigger if exists withdrawal_requests_self_service_guard on public.withdrawal_requests;
create trigger withdrawal_requests_self_service_guard
before update on public.withdrawal_requests
for each row
execute function public.enforce_withdrawal_request_self_service_update();
