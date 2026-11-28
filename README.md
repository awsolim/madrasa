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

## Teacher payment checks

Open **Classes → Finances → Billing**. Finance permission is required.
The heading names the month of the displayed check. Settled monthly periods show
the month as paid; annual coverage and adjusted bills are identified explicitly.
When this period is settled but an older bill remains unpaid, both facts appear.

- **Needs attention** lists confirmed outstanding Stripe bills first, including
  each remaining balance, billing period and due date. It also includes setup,
  missing evidence and failed checks, with the distinct reason shown. Do not
  request payment solely because a record needs checking. A later paid invoice
  does not hide an older unpaid invoice. Open the row for the student file.
- **In order** includes settled current periods, future first payments, recorded
  waivers/external payments and free arrangements. The reason is shown explicitly.
- The two compact lists show student/parent names and a brief payment status or
  unpaid amount. Open a row for invoice details, dates and explanations. Search
  accepts student or parent names; former students remain visible when relevant.

Press the refresh icon for a fresh check; its tooltip includes the check time.
The server reads linked subscriptions and their invoices with four concurrent
workers, at most three invoice pages per subscription and a shared 25-second
Stripe request budget. Incomplete checks remain explicitly unverified. These
checks never charge, refund, cancel or update Stripe/database records, and do
not continuously poll. Results stay in the signed-in user's memory cache only.
Older subscriptions no longer linked to a student, and fees never billed or
recorded, require a separate historical reconciliation. A refund does not by
itself create a new balance owing. This screen is not an audit of unbilled fees.

For new monthly checkouts in Al Tarteel and Weekend School, the first is a full
month, the 2nd–25th inclusive is prorated, and the 26th onward has no opening-month
charge; the first full payment is on the next first at 9 am in the class timezone.
The dated Al Tarteel November 2026 waiver remains in effect. This changes no
existing subscription or annual plan. A Stripe checkout already open retains
its quoted terms; start a fresh checkout to use the current date's policy.
No migration is required for the cutoff or payment-check screen.

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

The Assiddiq directory contains the two published classes: Al Tarteel and Weekend
School 2026/27. Published descriptions, audience, location, track schedules,
monthly/annual price options, director names and emails were checked against the
database on November 26, 2026. A snapshot timestamp records that check; live seat
counts and enrollment records are not exported. The page clearly explains that
registration inquiries go directly to the teacher while online services fail.

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

Owner-confirmed contact corrections can be retained in
`data/class-directory/overrides/<slug>.json`, keyed by program ID. Weekend School's
confirmed phone is retained there because its database phone fields currently
contain an invalid placeholder and a conflicting number. Overrides are applied
before export and their notes are not included in the public HTML. Invalid phone
placeholders are skipped rather than hiding the next valid contact number.

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

### Public class links and browse thumbnails

Apply `supabase/migrations/20261126233652_public_program_links_and_thumbnail_display.sql`
before deploying the matching app changes. It adds stable public slugs;
it does not alter enrollment, subscriptions or public
visibility. Existing published/hidden classes receive title-based slugs, unique
within their masjid, with numeric suffixes for duplicate names. Drafts receive a
slug when first published. Subsequent title edits retain the same link.

Public cards and Share use these readable links. Existing UUID links still work,
including staff previews; operational routes and payment/enrollment references
continue using UUIDs. On tenant subdomains, shared links use `/programs/class-name`
without repeating the masjid path. Unpublishing a class disables its public slug
lookup without releasing its reserved name.

Browse thumbnails fill the top-left section of each card without padding.
The builder's **Browse thumbnail** preview has a **Change** button that opens
image selection followed by a square crop tool. Keep important text away from
the edges: responsive cards may crop the image further to fill their section.
Re-upload the original if an older stored image is already cropped. The large
class-detail cover is unchanged. Thumbnail styling needs no database migration.

Local verification (no Docker or external database):
`node --test --test-isolation=none tests/public-program-links.test.mjs tests/public-program-links-db.test.mjs`.

### Owner's device account switcher

Profile includes **Switch account** for the explicitly configured Amr Soliman
admin profile. Set it up once in the browser or installed PWA being used, then
sign in to each of the other three configured accounts using its existing password
or Google login. Switch back to the admin account to add the next one. The four
profile IDs are deliberately allowlisted in `src/lib/account-switching/policy.ts`;
this is not a general admin impersonation feature and grants no new permissions.

Other devices have no saved-account store, so teachers there do not see the
switcher. On the configured device, all four accounts can switch to already-saved
sign-ins; only the owner admin gets setup/add/remove controls. Passwords are never
stored. Supabase session credentials are saved locally, with refresh-token changes
mirrored from the active SDK session. They are sensitive like the app's existing
remembered sign-in; use a personally controlled device. Browser/PWA storage is
origin-specific and may be separate on iOS. Clearing it forgets the saved accounts.

Switches restore and verify the target's own session, stop inactive refresh work,
detach the previous device notification association and replace the page to clear
mounted private content. This still needs a working Auth service. Account revocation
or expiration can require another login. Normal **Log out** revokes/removes the
current saved session only. **Forget saved accounts on this device** removes the
local switcher store while retaining the current normal sign-in. No migration,
password changes, privileged session-minting API or teacher-device setup is needed.

Verification: `node --test --test-isolation=none tests/device-account-switching.test.mjs tests/session-recovery.test.mjs tests/logout-navigation.test.mjs`.

### Read-access performance cleanup

Applied manually to production and verified on November 27, 2026. All three
consolidated policies are installed with RLS enabled and SECURITY INVOKER
helpers. A live authenticated own-profile check measured 9.898 ms including
planning, compared with 148.678 ms before the change. Signed-in class browse,
teacher class lists, notification counts and guest browse also completed
successfully (approximately 143–178 ms execution in individual checks). These
samples verify the change, not a sustained latency or availability guarantee.

`supabase/migrations/20261127174834_consolidate_read_access_checks.sql` combines
the existing permissive SELECT policies on profiles, mosque memberships and
enrollments into one invoker helper per table. It captures the rules present
when applied, including their role restrictions, and gives the existing own-row
permission a short path. It does not invent new role permissions or remove old
permission decisions. ALL, restrictive, INSERT, UPDATE and DELETE policies are
left intact. RLS remains enabled. No managed Auth configuration, table data,
subscription or payment is changed, and no unmeasured indexes are added.

These helpers live in the non-exposed `madrasa_rls` schema and are explicitly
SECURITY INVOKER. Queries inside them still obey the caller's table privileges
and RLS. Applicable rules are evaluated in separate PL/pgSQL branches: placing
authenticated-only functions behind a CASE in one SQL expression would still
cause an anonymous caller's function-privilege check to fail during planning.
The migration aborts if the expected own-row policy has changed, and rerunning
it does not capture its own consolidated policy.

The local fixture contains schema/policy/function definitions checked against
production on November 27, 2026, with entirely synthetic identities and data.
It compares before/after visible rows, granular finance/application/enrollment
permissions, updates and six snapshot RPCs for guests, admins, directors,
instructors with different grants, students, parents, children, other tenants,
inactive/unverified instructors and a legacy-role account. No Docker, hosted
test database, real emails or Stripe operations are involved.

Run `node --test --test-isolation=none tests/read-access-cleanup-db.test.mjs`.
Run `node scripts/benchmark-read-access.mjs` for five-sample local medians.
An observed synthetic run (milliseconds, including planning) was:

| Query | Before | After |
| --- | ---: | ---: |
| Own profile | 49.767 | 0.222 |
| Profile list | 49.732 | 23.138 |
| Signed-in class browse | 39.796 | 1.802 |
| Director class list | 49.855 | 6.057 |
| Director notification counts | 48.500 | 1.926 |
| Guest class browse | 35.434 | 1.171 |

These are local PostgreSQL/WASM measurements, not promised production timings
or evidence that the memory-commitment warning has been resolved. Continue
checking the same live pages and timestamped timeout logs under normal usage.
Monitor memory commitment, swap, connection
count and disk I/O separately; an instance upgrade remains a separate action.

For rollback, use
`supabase/rollback/20261127174834_restore_read_access_checks.sql`. It restores the
exact policies saved in each helper's comment at application time. It aborts
instead of overwriting any same-named policies added later. The rollback and
reapplication are covered by the local tests; it removes no tables or records.
