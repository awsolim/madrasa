// Netlify invokes this every minute on production deploys. Billing operations
// persist in Supabase, so closing the browser cannot abandon half an update.
export const config = { schedule: "* * * * *" };

export default async function maintainClassLifecycle() {
  const origin = process.env.URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error("Class lifecycle maintenance is missing its site URL or service key.");
  const response = await fetch(new URL("/api/internal/class-lifecycle", origin), {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(28000),
  });
  if (!response.ok) throw new Error(`Class lifecycle maintenance failed (${response.status}). Check the app error log.`);
}
