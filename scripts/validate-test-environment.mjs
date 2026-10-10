const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing test environment values: ${missing.join(", ")}`);

const placeholders = required.filter((name) => /replace_me|example\.com|your[-_ ]/i.test(process.env[name] ?? ""));
if (placeholders.length) {
  throw new Error(`Replace placeholder test environment values: ${placeholders.join(", ")}`);
}

if (process.env.MADRASA_TEST_ENVIRONMENT !== "true") {
  throw new Error("MADRASA_TEST_ENVIRONMENT must be exactly true.");
}

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const localSupabase = ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);
if (!localSupabase && process.env.ALLOW_REMOTE_TEST_SUPABASE !== "true") {
  throw new Error("Refusing to use a remote Supabase project without ALLOW_REMOTE_TEST_SUPABASE=true.");
}

if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("Refusing to start the test app without a Stripe test-mode secret key.");
}

if (process.env.RESEND_API_KEY && !process.env.EMAIL_TEST_RECIPIENT) {
  throw new Error("Set EMAIL_TEST_RECIPIENT or remove RESEND_API_KEY so test emails cannot reach real users.");
}

console.log(`Safe test environment verified (${localSupabase ? "local Supabase" : "approved remote test Supabase"}, Stripe test mode).`);
