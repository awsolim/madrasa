# Class lifecycle

The class card's three-dot menu now opens **Class lifecycle**. Only a masjid admin or the program director can use it. Instructors with finance or editing access do not gain permission to end an entire class.

## Behavior

- **Pause** closes applications, expires outstanding payment links, and pauses monthly collection with Stripe's `void` policy. Invoices during the pause are skipped. Existing enrollment and paid records remain. Pausing does not refund or extend prepaid time. An active annual plan blocks this action until staff resolve its coverage/renewal individually.
- **Resume** resumes only the subscriptions paused by the class operation. Preexisting individual pauses and cancellation dates are preserved. There is no immediate charge or catch-up invoice; the existing billing dates continue. Applications stay closed until staff deliberately reopen them.
- **End** stops every recurring subscription immediately, without a final invoice or cancellation proration. The director chooses immediate loss of access or a last day of access in the class timezone. Pending applications/withdrawals are resolved and invites revoked. Any annual or monthly refund is a separate, custom refund from the student file.
- **Archive** is available only after active enrollments, recurring billing, payment links and pending requests are resolved. The class moves into the staff **Archived** list. Student, financial, attendance and other historical records are retained. Class content is read-only; refunds and financial audit records can still be recorded.

The preview reads Stripe's current records, including subscriptions that the local database says are canceled. It blocks unusual billing configurations, subscription schedules, open/draft invoices, pending invoice items, and unsettled checkouts. A new preview is required if the reviewed data changes before confirmation.

Operations are persisted with one completed step per subscription/checkout. Retries use the same Stripe idempotency keys. A lease prevents two requests from running the same step together. Admissions, payment links, and wizard status changes cannot bypass the operation. An unsuccessful operation remains visible as unfinished and does not masquerade as a completed pause/end/archive.

The Netlify scheduled function retries unfinished billing work and notifications each minute. The database also finalizes access each minute, independently of a browser being open. Errors remain on the operation and in the application error log. Unexpected new subscriptions or checkouts that complete during confirmation stop processing for individual review; staff must resolve the discrepancy rather than silently charging or refunding someone.

## Deployment and verification

1. Test the migration `supabase/migrations/20261109120000_program_lifecycle_operations.sql` against the isolated test database using its local SQL editor. Do not use a linked production reset. The migration creates the operation table, guards, and pg_cron job; it does not end, pause, or archive any class.
2. Start the app using `npm run dev:test`. Create a disposable program with one waived student and a Stripe sandbox monthly subscriber. Review Pause, then confirm. Verify applications are closed, enrollment stays active, and Stripe shows `pause_collection.behavior = void`. Resume and verify the old billing anchor remains.
3. Pause an individual subscriber first, then pause/resume the class. Verify the individual pause is still present.
4. Add a sandbox annual subscriber. Verify Pause is blocked and End displays their annual coverage for refund review. A refund must not happen merely by ending the class.
5. End a disposable class with immediate access removal. Verify every recurring subscription is canceled, enrollment is withdrawn, and history remains available. Then Archive and find it under Archived. Test a refund through the archived student's file.
6. End another class with a future last-access date. Verify billing stops immediately, enrollment remains active until that date, and the `finalize-ended-classes` job is active in the local database. The deadline is the following midnight in the class timezone; the job runs every minute.
7. Test a rejected permission, a changed preview, an open Stripe invoice, and an interrupted operation. A director can reopen Class lifecycle and Continue. `npm run dev:test` alone does not run Netlify schedules, so local interruptions must be continued from the dialog or invoked using Netlify Dev.
8. For production, apply the reviewed migration before deploying the app. Deploying does not execute any class action. In Netlify's Functions page, verify `class-lifecycle` is marked Scheduled and use **Run now** once. The scheduled function needs the existing `SUPABASE_SERVICE_ROLE_KEY` available in the Functions environment and Netlify's built-in `URL`. It calls the same deployment's authenticated internal maintenance endpoint. It does not require a new external webhook or cron secret.
9. After the sandbox cases pass and the production job is visible, use Class lifecycle on the real program. Review each student and choose the last access day before confirming. Deployment itself never selects a real program for closure.

Automated checks:

```sh
node --test tests/program-lifecycle.test.mjs tests/program-lifecycle-db.test.mjs
npx tsc --noEmit
npm run build
```

An optional smoke runner, `node --env-file=.env.test.local scripts/test-class-lifecycle.mjs http://localhost:3100`, creates clearly labeled local fixtures and Stripe sandbox subscriptions. Start the isolated app on that port with `node scripts/start-test-dev.mjs --webpack --port 3100`. The runner refuses remote databases, remote app origins, and live Stripe keys. It tests pause/resume (including an existing individual pause), the annual-pause guard, immediate end, and archive. It cancels every Stripe test subscription it creates, even on failure, and leaves local fixtures for inspection. It requests no notification delivery. No real class is selected by this runner.

The database tests use in-memory PostgreSQL and test the migration's real functions/triggers. They stub application tables and the cron scheduler; they do not substitute for the sandbox Stripe/UI cases above or verify a hosted deployment.

References: [Stripe cancellation](https://docs.stripe.com/billing/subscriptions/cancel), [Stripe collection pause](https://docs.stripe.com/billing/subscriptions/pause-payment), [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/).
