-- Enrollment activation is already restricted to the atomic server-side completion
-- functions. This trigger incorrectly treated historical and one-time annual records
-- as recurring subscriptions, so remove it. Existing active enrollment remains the
-- authoritative proof that registration completed.
drop trigger if exists active_enrollment_billing_evidence_guard on public.enrollments;
drop function if exists public.enforce_active_enrollment_billing_evidence();
