"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { fetchWithTimeout } from "@/lib/supabase/fetch-with-timeout";
import { detachLogoutNotifications, setCachedSessionSnapshot } from "@/lib/client-cache";
import { browserHref } from "@/lib/navigation-paths";
import { isSwitchAccount, SWITCH_OWNER_ID } from "./policy";
import { readDeviceAccounts, rememberDeviceSession, removeDeviceAccount } from "./device-store";

export async function switchDeviceAccount(targetId: string, slug: string, credentials?: { email: string; password: string }) {
  const { url, anonKey } = getSupabasePublicEnv();
  if (!isSwitchAccount(targetId) || !readDeviceAccounts(url)) throw new Error("Set up account switching from Amr's admin account first.");
  if (!navigator.locks) throw new Error("This browser cannot safely switch saved accounts. Update it and try again.");
  await navigator.locks.request(`madrasa:account-switch:${url}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error("An account switch is already running in another tab.");
    const main = createSupabaseBrowserClient();
    const { data: { session: current }, error: currentError } = await main.auth.getSession();
    if (currentError || !current || !isSwitchAccount(current.user.id)) throw new Error("Sign in to one of your saved accounts first.");
    rememberDeviceSession(url, current);
    if (current.user.id === targetId) return;
    // Only the original admin may add/reconnect accounts. A teacher session on
    // the configured device may return to accounts already signed in there.
    if (credentials && current.user.id !== SWITCH_OWNER_ID) throw new Error("Return to Amr's admin account to add a sign-in.");
    const saved = readDeviceAccounts(url)?.accounts.find(a => a.id === targetId);
    if (!credentials && !saved) throw new Error("Sign in to this account from Amr's admin account first.");
    const temporary = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `madrasa-switch-${crypto.randomUUID()}` },
      global: { fetch: fetchWithTimeout() },
    });
    let next: Session;
    try {
      const { data, error } = credentials
        ? await temporary.auth.signInWithPassword(credentials)
        : await temporary.auth.setSession({ access_token: saved!.accessToken, refresh_token: saved!.refreshToken });
      if (error || !data.session) {
        if (!credentials && error && ["refresh_token_not_found", "refresh_token_already_used", "session_not_found"].includes(error.code ?? "")) removeDeviceAccount(url, targetId);
        throw new Error(credentials ? "Could not sign in. Check the email and password." : "This saved sign-in could not be restored. Try again, or reconnect it from your admin account.");
      }
      if (data.session.user.id !== targetId) {
        await temporary.auth.signOut({ scope: "local" });
        throw new Error("That login belongs to a different account. Your current account has not changed.");
      }
      next = data.session;
      // Preserve a newly rotated token even if adopting it on the main client
      // subsequently fails. No inactive client runs background refresh jobs.
      rememberDeviceSession(url, next, false);
    } finally { await temporary.auth.stopAutoRefresh(); }
    await detachLogoutNotifications(current.access_token);
    const { data, error } = await main.auth.setSession({ access_token: next.access_token, refresh_token: next.refresh_token });
    if (error || !data.session) throw new Error("Could not open that account. Try again.");
    setCachedSessionSnapshot(data.session);
    // Discard mounted private content and route caches before showing the new
    // role. The existing BFCache guard also rereads auth when navigating Back.
    window.location.replace(browserHref(`/m/${slug}/programs`, slug, window.location.hostname));
  });
}
