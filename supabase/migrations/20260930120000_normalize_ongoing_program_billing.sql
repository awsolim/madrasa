-- Ongoing programs have no predetermined billing end. Clear legacy duration values
-- so future approvals cannot accidentally create a fixed Stripe schedule.
alter table public.programs
  alter column billing_duration_months drop not null;

update public.programs
set
  billing_end_behavior = 'manual_cancel',
  billing_duration_months = null,
  duration_months = null,
  end_date = null
where is_ongoing = true
  and (
    billing_end_behavior is distinct from 'manual_cancel'
    or billing_duration_months is not null
    or duration_months is not null
    or end_date is not null
  );
