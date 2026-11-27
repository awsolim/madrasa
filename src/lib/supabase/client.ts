"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { fetchWithTimeout } from "@/lib/supabase/fetch-with-timeout";
import { readDeviceAccounts, rememberDeviceSession, removeDeviceAccount } from "@/lib/account-switching/device-store";

type BrowserClient = ReturnType<typeof createClient<Database>>;
type ClientEntry = { url: string; anonKey: string; client: BrowserClient };
const browserGlobal = globalThis as typeof globalThis & { __madrasaSupabaseClient?: ClientEntry };
let serverClient: ClientEntry | undefined;

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  // Fast Refresh re-evaluates this module. Keep one browser auth client (and
  // refresh-token owner) through those reloads without changing its storage key.
  const existing = typeof window === "undefined" ? serverClient : browserGlobal.__madrasaSupabaseClient;
  if (existing?.url === url && existing.anonKey === anonKey) return existing.client;
  const client = createClient<Database>(url, anonKey, {
    global: { fetch: fetchWithTimeout() },
  });
  const entry = { url, anonKey, client };
  if (typeof window === "undefined") serverClient = entry;
  else {
    browserGlobal.__madrasaSupabaseClient = entry;
    client.auth.onAuthStateChange((event, session) => {
      // Save only actual SDK sessions, including rotated refresh tokens. Other
      // devices have no local account bank and this is a no-op for them.
      try {
        if (session) rememberDeviceSession(url, session);
        else if (event === "SIGNED_OUT") {
          const activeId = readDeviceAccounts(url)?.activeId;
          if (activeId) removeDeviceAccount(url, activeId);
        }
      } catch { /* A full/blocked store must not break normal authentication. */ }
    });
  }
  return client;
}
