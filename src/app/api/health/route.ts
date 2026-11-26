import { checkDependencies } from "@/lib/monitoring/dependency-health";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let result;
  try {
    const { url, anonKey } = getSupabasePublicEnv();
    result = await checkDependencies(url, anonKey);
  } catch {
    result = { status: "degraded", checks: { configuration: { status: "down" } } };
  }
  return Response.json({ ...result, checkedAt: new Date().toISOString() }, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
