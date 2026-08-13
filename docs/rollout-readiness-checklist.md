# Rollout Readiness Checklist

This checklist captures production items that cannot be fully proven from local code alone.

## Must Complete Before Public Rollout

- Disable any production access to development account switching.
- Review all API routes that use the Supabase service role and confirm each route authenticates the caller and checks the exact permission required before reading or mutating data.
- Configure production Supabase Auth settings:
  - production site URL and redirect URLs
  - stronger password requirements
  - secure password change
  - production SMTP/email settings when email notifications are enabled
- Run live-mode or test-mode Stripe end-to-end checks for:
  - monthly subscriptions
  - annual subscriptions
  - fixed billing month counts
  - waived approvals
  - price changes after approval
  - subscription cancellation
  - webhook retry/idempotency
- Have Terms of Service and Privacy Policy reviewed for the production operating model, especially minors, guardian consent, payments, refunds, attachments, voice notes, retention, deletion, and tax receipt language.

## Recommended Polish Before Rollout

- Split `src/components/data/supabase-public-sections.tsx` into feature modules so route bundles and data-loading paths are easier to optimize.
- Replace scattered browser-side Supabase loading with route-specific snapshots for the heaviest screens.
- Add smoke tests for parent apply, teacher approve, payment confirmation, attendance, notes, announcements, exports, and account switching guards.
- Decide whether message and note attachments should remain public URLs or move to signed/private access.
- Add export audit events for CSV downloads that include student, family, or finance data.
- Verify PWA install behavior on tenant/subdomain URLs.

## Deployment Checks

- Confirm `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` points to the production domain.
- Confirm Stripe webhook secret and live/test mode are matched correctly.
- Confirm Supabase storage buckets, RLS policies, and public/private bucket settings match the intended attachment model.
- Confirm push-notification VAPID keys are configured only in the intended environment.
- Confirm the service worker updates cleanly after a new deployment.
