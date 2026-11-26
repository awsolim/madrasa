This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Availability and outage recovery

`GET /api/health` checks the deployed app's connection to Supabase Auth and one
anonymous, read-only database query. It returns HTTP 200 when both succeed and
HTTP 503 otherwise, with separate dependency results and a UTC timestamp. Each
probe has a five-second deadline; no account, email, payment or tenant record is
returned. No service-role key is used. This is a readiness check, not proof that
signup, authenticated permissions, Stripe, email or every tenant workflow works.

`.github/workflows/availability.yml` runs this check from GitHub every 15 minutes,
away from the top of the hour, and can be run manually from Actions. It requires
no Supabase credentials. Deploy the endpoint and push the workflow to the default
branch to activate it. For another deployment, set the repository Actions variable
`MADRASA_HEALTHCHECK_URL` to its HTTPS health endpoint. In your GitHub notification
settings, enable Actions failure notifications and verify delivery with a manual
run against a deliberately unavailable URL, then restore the production URL.
Neither the schedule nor notification delivery has been configured or verified
by adding these files. GitHub schedules can be delayed; this is a basic monitor,
not a guaranteed paging system or an uptime SLA.

During an outage:

1. Compare `/api/health`, the app's actual failed requests, Supabase project logs,
   and [Supabase status](https://status.supabase.com). A project marked healthy
   does not establish that its Auth and database endpoints are responding.
2. Record the UTC time, affected endpoint, status and duration. Do not copy access
   tokens, passwords, API keys or personal records into support tickets.
3. A failed account request is not evidence that the user signed out. Signup
   timeouts also do not establish that an account was never created. Check for
   confirmation email or use the existing-account login/reset flow.
4. For an ambiguous payment/refund/cancellation, inspect Stripe and the local
   record before repeating the action. Subscription billing at Stripe can continue
   while the app or webhook processing is unavailable. Do not replay mutations
   merely because the client timed out.
5. After recovery, check the affected workflow end to end. Review failed Stripe
   deliveries and use `npm run reconcile:stripe-billing` in its default dry-run
   mode to identify missing records. Review its report before any apply operation.

## Backups and recovery readiness

**Off-site backup automation and a restore drill are not established yet.** Code,
migrations, an uptime monitor, and the local test database do not back up live data.

Before calling recovery operational, designate an owner and a secure encrypted
destination outside the Supabase project, establish a daily schedule and retention,
and verify the backup's age and completion from outside Supabase. Set recovery
targets explicitly: a daily backup can lose up to a day of changes. Recovery time
is unknown until a restore has been timed successfully.

Use Supabase's [backup guide](https://supabase.com/docs/guides/platform/backups)
and [CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-and-upgrading-projects/migrate-between-projects)
for the export supported by the current plan. On Free, arrange regular logical
exports; managed paid backups do not by themselves establish an independent copy.
Verify Auth users, roles, schema, RLS policies, functions, triggers and application
data are included. Database backups do not include Storage object files: copy
those separately and inventory application configuration and secrets securely.
Never commit dumps, keys or student records to Git, or upload them as public CI
artifacts. Keep backup credentials separate from the browser's public key.

Restore only into an isolated recovery environment, never over production. Disable
or replace outgoing email, push, Stripe keys, webhook processing and scheduled jobs
before allowing that environment to run. The restored database may contain live
Stripe identifiers and production cron jobs. Verify user/profile relationships,
enrollments, payment/refund records, policies and Storage objects. Test representative
roles using authorized test identities and Stripe sandbox data. Record the backup
timestamp, counts, missing objects, restore duration and drill date. A successful
restore drill and an explicit cutover plan are required before production recovery.

## Public class directory during outages

Normal tenant visits open the Classes tab without requiring account creation.
Guests can browse the existing public listings and class details with the regular
app navigation. Schedule, Inbox and Me show login/account-creation prompts rather
than empty personal data. Signing in resolves the appropriate staff/family portal;
class-detail login links return to the selected class, including on tenant
subdomains. The old `/explore` URL redirects to the regular class list. Applying,
private records and operational actions retain their existing authentication and
server/RLS protections. Public browsing still requires a working Data API; the
independent directory below is the outage fallback.

`/continuity/assiddiq.html` is a standalone, script-free page served from `public/`.
It makes no database, Auth, Storage, image or font requests, and bypasses the app's
layouts and account guards. It remains usable during a Supabase outage provided
the website host and the visitor's internet connection are working. Teachers can
share this URL directly. It provides contact-based inquiries, not offline account,
attendance, enrollment or financial operations. Existing subscriptions are unchanged.

The starter Assiddiq directory contains the two classes confirmed by the owner:
Al Tarteel (Sheikh Mohamed Moamen) and Weekend School (Sheikh Abdulrahman), with
both phone numbers confirmed by the owner. No current
schedule, fee, availability or update timestamp has been invented.

To maintain the preset directory without database access, edit the public-only
`data/class-directory/assiddiq.json` and run `npm run directory:render`. Review and
commit the JSON, generated HTML and `tenants.json` together. Do not include student
records or private staff information. Add another tenant using its own slug-named
JSON file, then render again. Remove obsolete classes when they cease to be public.

When Supabase is healthy, `npm run directory:refresh -- --mosque=assiddiq` reads
the existing public RPCs using only the public key and prepares a fresh snapshot.
Run `npm run directory:render` afterwards. Review contacts and listings before
committing/deploying. Failed reads retain the existing files; this is deliberately
not a live fetch, automatic deployment, or a database migration. A saved directory
can become stale, so its notice asks visitors to confirm details with the teacher.

Automatic account/class connection errors offer **Classes & contacts**, including
a ten-second recovery option during account startup. This is a local failure
fallback; it does not claim that every visitor is affected or log anyone out.

For a confirmed outage, set the server environment variable
`MADRASA_MAINTENANCE_TENANTS=assiddiq` (comma-separated for multiple prepared
tenants), then redeploy/restart the website so that the environment takes effect.
Tenant app URLs temporarily redirect straight to their directory without attempting
Auth/database access. API routes, including payment webhooks, remain untouched.
Remove the variable and redeploy after recovery. It defaults off. No maintenance
switch has been enabled on production by this change.
