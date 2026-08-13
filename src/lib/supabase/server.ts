import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { fetchWithTimeout } from "@/lib/supabase/fetch-with-timeout";

/** Anon-key client scoped to a caller's own access token, so RLS applies exactly as it
 * would for that user in the browser. Use this (not the service-role client) when a route
 * needs to check "can this user read row X" without duplicating an RLS policy in JS. */
export function createSupabaseServerClient(accessToken?: string) {
  const { url, anonKey } = getSupabasePublicEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      fetch: fetchWithTimeout(),
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    },
  });
}
