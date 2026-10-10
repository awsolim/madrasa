# Isolated test environment

The test app uses the same code as production with separate Supabase data and Stripe test-mode objects. It must never use production credentials.

## Local setup

1. Install and start Docker Desktop.
2. Run `npm run test-db:start`. This starts the separate `madrasa_test` stack from the schema-only baseline in `test-environment`; it does not replay the incomplete historical production migration chain.
3. Run `npm run test-db:configure`. This copies the running local URL and keys into `.env.test.local` without printing secrets.
4. Run `npm run test-env:check` and do not continue unless it reports a safe local Supabase and Stripe test mode.
5. In the Stripe Dashboard, enable **Test mode** and copy the `sk_test_...` and `pk_test_...` keys.
6. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy its test `whsec_...` value.
7. Run `npm run dev:test`.

Use `npm run test-db:status` to inspect the stack and `npm run test-db:stop` when testing is finished. The checked-in baseline contains schema only: no production students, payments, accounts, notes, or other rows.

The launcher refuses live Stripe keys and refuses remote Supabase projects unless `ALLOW_REMOTE_TEST_SUPABASE=true` is explicitly set. Application email is suppressed by default. If Resend is enabled, every recipient is replaced with `EMAIL_TEST_RECIPIENT` and the subject is prefixed with `[TEST]`.

Supabase authentication messages appear in the local Mailpit inbox at `http://127.0.0.1:54324`.

## Suggested fixtures

Create one admin, one director, one instructor, one adult student, and one parent with two children through the normal signup screens. Add monthly, annual, waived, pending-payment, and past-due cases with Stripe test cards. These records affect only the local database and Stripe test mode.
