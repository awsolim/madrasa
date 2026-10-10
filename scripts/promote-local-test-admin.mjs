import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run test-admin:promote -- you@example.com");

const config = parseEnv(readFileSync(".env.test.local", "utf8"));
const url = new URL(config.NEXT_PUBLIC_SUPABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  throw new Error("Refusing to modify accounts outside the local Supabase test environment.");
}

const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let page = 1;
let user;
while (!user) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (user || data.users.length < 100) break;
  page += 1;
}
if (!user) throw new Error(`No local test account exists for ${email}. Create it in the app first.`);

const { data: mosque, error: mosqueError } = await supabase
  .from("mosques")
  .upsert({ name: "Assiddiq Islamic Center", slug: "assiddiq", pwa_name: "Assiddiq Islamic Center", short_name: "Assiddiq" }, { onConflict: "slug" })
  .select("id")
  .single();
if (mosqueError) throw mosqueError;

const metadata = { ...user.user_metadata, account_type: "admin", mosque_slug: "assiddiq" };
const { error: authError } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: metadata });
if (authError) throw authError;

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  email: user.email,
  full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? "Test Admin",
  phone_number: user.user_metadata?.phone ?? null,
  account_type: "admin",
  gender: null,
  date_of_birth: null,
  updated_at: new Date().toISOString(),
});
if (profileError) throw profileError;

await supabase.from("mosque_memberships").delete().eq("mosque_id", mosque.id).eq("profile_id", user.id);
const { error: membershipError } = await supabase.from("mosque_memberships").insert({
  mosque_id: mosque.id,
  profile_id: user.id,
  role: "admin",
  status: "active",
  can_manage_programs: true,
  can_create_programs: true,
  updated_at: new Date().toISOString(),
});
if (membershipError) throw membershipError;

console.log(`Promoted ${email} to administrator in local Assiddiq test data.`);
