-- Checkout creates a local pending row before the payer opens Stripe. The
-- legacy constraint only allowed active/canceled/ended, rejecting that write
-- and also rejecting valid Stripe webhook states such as past_due and unpaid.
-- Retain the constraint and all existing rows; admit the states used by the
-- checkout, paid-enrollment and subscription synchronization flows.
alter table public.program_subscriptions
  drop constraint if exists program_subscriptions_status_check,
  add constraint program_subscriptions_status_check check (status in (
    'checkout_started',
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused',
    'paid', 'ended'
  ));
