import { createClient } from "@supabase/supabase-js";

const PROTECTED_ACCOUNT_IDS = [
  "6a3f9d49-bea4-4f6a-a7be-d56722f2bcc8",
  "1f4ae8f7-2a5d-4e1b-bb49-502ea25af681",
  "63488027-a499-427f-b7fc-31a3a5e84c20",
  "26be28eb-66e0-46ce-a224-b308b4a94351",
  "df2ce3e8-37e5-4d04-967f-a0e51bb1c85c",
];

const CONFIRMATION = "DELETE_FAKE_USERS_KEEP_5";
const execute = process.argv.includes("--execute");
const confirmed = process.argv.includes(`--confirm=${CONFIRMATION}`);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

if (execute && !confirmed) {
  throw new Error(`Execution requires --confirm=${CONFIRMATION}`);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function label(profile) {
  return `${profile.full_name || "Unnamed"} <${profile.email || "no email"}> (${profile.id})`;
}

async function countMatches(table, columns, ids) {
  if (!ids.length) return 0;
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = columns.length === 1
    ? query.in(columns[0], ids)
    : query.or(columns.map((column) => `${column}.in.(${ids.join(",")})`).join(","));
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function deleteMatches(table, columns, ids) {
  if (!ids.length) return;
  let query = supabase.from(table).delete();
  query = columns.length === 1
    ? query.in(columns[0], ids)
    : query.or(columns.map((column) => `${column}.in.(${ids.join(",")})`).join(","));
  const { error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
}

const { data: profiles, error: profileError } = await supabase
  .from("profiles")
  .select("id, full_name, email, account_type")
  .order("full_name");
if (profileError) throw profileError;

const profileIds = new Set((profiles ?? []).map((profile) => profile.id));
const missingProtected = PROTECTED_ACCOUNT_IDS.filter((id) => !profileIds.has(id));
if (missingProtected.length) {
  throw new Error(`STOPPED: protected profile IDs were not found: ${missingProtected.join(", ")}`);
}

const { data: familyLinks, error: familyError } = await supabase
  .from("parent_child_links")
  .select("parent_profile_id, child_profile_id")
  .in("parent_profile_id", PROTECTED_ACCOUNT_IDS);
if (familyError) throw familyError;

const protectedIds = new Set(PROTECTED_ACCOUNT_IDS);
for (const link of familyLinks ?? []) protectedIds.add(link.child_profile_id);

const protectedProfiles = (profiles ?? []).filter((profile) => protectedIds.has(profile.id));
const fakeProfiles = (profiles ?? []).filter((profile) => !protectedIds.has(profile.id));
const fakeProfileIds = fakeProfiles.map((profile) => profile.id);
const authUsers = await allAuthUsers();
const fakeAuthUsers = authUsers.filter((user) => !protectedIds.has(user.id));

const { data: liveStripeRows, error: liveStripeError } = fakeProfileIds.length
  ? await supabase
      .from("program_subscriptions")
      .select("id, student_profile_id, parent_profile_id, stripe_subscription_id, status")
      .or(`student_profile_id.in.(${fakeProfileIds.join(",")}),parent_profile_id.in.(${fakeProfileIds.join(",")})`)
      .in("status", ["active", "trialing", "past_due"])
  : { data: [], error: null };
if (liveStripeError) throw liveStripeError;

console.log("\nPROTECTED PROFILES (accounts plus their linked children)");
for (const profile of protectedProfiles) console.log(`  KEEP  ${label(profile)}`);
console.log("\nPROFILES TO DELETE");
for (const profile of fakeProfiles) console.log(`  DELETE ${label(profile)}`);
console.log("\nAUTH USERS TO DELETE");
for (const user of fakeAuthUsers) console.log(`  DELETE ${user.email || "no email"} (${user.id})`);
if (liveStripeRows?.length) {
  console.log("\nLIVE STRIPE SUBSCRIPTIONS — MUST BE CANCELLED BEFORE CLEANUP");
  for (const row of liveStripeRows) console.log(`  ${row.stripe_subscription_id || row.id} (${row.status})`);
}

// Rows with SET NULL profile references must be removed explicitly. Rows with
// cascading student/profile references are included too so the report is complete.
// Programs, tracks, sessions, mosque configuration, and class media are never targets.
const targets = [
  ["program_payments", ["student_profile_id", "parent_profile_id", "tax_receipt_issued_by"]],
  ["program_finance_audit_events", ["student_profile_id", "actor_profile_id"]],
  ["program_payment_terms", ["student_profile_id", "parent_profile_id", "approved_by"]],
  ["program_subscriptions", ["student_profile_id", "parent_profile_id"]],
  ["program_student_notes", ["student_profile_id", "recipient_profile_id", "parent_profile_id", "author_profile_id", "seen_by"]],
  ["program_attendance_records", ["student_profile_id", "marked_by"]],
  ["program_track_switch_requests", ["student_profile_id", "requested_by", "decided_by"]],
  ["withdrawal_requests", ["student_profile_id", "parent_profile_id", "requested_by", "reviewed_by"]],
  ["program_student_invites", ["claimed_by_profile_id", "created_by"]],
  ["program_instructor_events", ["teacher_profile_id"]],
  ["program_session_cancellations", ["cancelled_by"]],
  ["program_announcements", ["author_profile_id"]],
  ["enrollment_requests", ["student_profile_id", "parent_profile_id", "reviewed_by"]],
  ["enrollments", ["student_profile_id"]],
  ["program_teachers", ["teacher_profile_id"]],
  ["teacher_notification_state", ["user_id"]],
  ["push_subscriptions", ["profile_id"]],
  ["program_announcement_receipts", ["profile_id"]],
  ["mosque_memberships", ["profile_id", "teacher_approval_reviewed_by"]],
  ["parent_child_links", ["parent_profile_id", "child_profile_id"]],
];

console.log("\nASSOCIATED ROWS");
const counts = [];
for (const [table, columns] of targets) {
  const count = await countMatches(table, columns, fakeProfileIds);
  counts.push([table, columns, count]);
  console.log(`  ${table}: ${count}`);
}

if (!execute) {
  console.log(`\nDRY RUN ONLY. Review every KEEP/DELETE row above.`);
  console.log(`To execute: npm run cleanup:fake-users -- --execute --confirm=${CONFIRMATION}`);
  process.exit(0);
}

if (liveStripeRows?.length) {
  throw new Error("STOPPED: fake profiles still have live Stripe subscriptions. Cancel them in Stripe, then rerun the dry run.");
}

if (!fakeProfileIds.length && !fakeAuthUsers.length) {
  console.log("Nothing to delete.");
  process.exit(0);
}

// Child/link tables are deleted before their owning profile rows. The database's
// remaining FK cascades clean up dependent join rows.
for (const [table, columns] of counts) {
  await deleteMatches(table, columns, fakeProfileIds);
  console.log(`Deleted matching rows from ${table}.`);
}

const { error: deleteProfilesError } = await supabase.from("profiles").delete().in("id", fakeProfileIds);
if (deleteProfilesError) throw new Error(`profiles: ${deleteProfilesError.message}`);

// Auth is last: relational cleanup has completed successfully before login access
// is irreversibly removed.
for (const user of fakeAuthUsers) {
  const { error } = await supabase.auth.admin.deleteUser(user.id, false);
  if (error) throw new Error(`auth user ${user.id}: ${error.message}`);
  console.log(`Deleted Auth user ${user.email || user.id}.`);
}

console.log("\nCleanup complete. Run the dry run again; both delete lists should be empty.");
