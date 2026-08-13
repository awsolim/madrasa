-- Adds 'annual' as a distinct payment_type on program_payment_terms, representing a
-- recurring yearly Stripe subscription for an ongoing program. Distinct from the existing
-- 'pay_in_full' value, which keeps meaning a one-time lump sum covering a fixed-duration
-- program's whole known length. Purely additive: widens the CHECK constraint, no data change.
alter table public.program_payment_terms
  drop constraint if exists program_payment_terms_payment_type_check,
  add constraint program_payment_terms_payment_type_check
  check (payment_type in ('free', 'waived', 'monthly', 'pay_in_full', 'annual'));
