"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { loadCachedSession } from "@/lib/client-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { browserHref } from "@/lib/navigation-paths";
import { SWITCH_OWNER_ID, isSwitchAccount, type SwitchAccount } from "@/lib/account-switching/policy";
import { DEVICE_ACCOUNTS_CHANGED, enableDeviceAccounts, forgetDeviceAccounts, readDeviceAccounts, removeDeviceAccount } from "@/lib/account-switching/device-store";
import { switchDeviceAccount } from "@/lib/account-switching/switch-session";

export function DeviceAccountSwitcher({ slug, userId }: { slug: string; userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SwitchAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<SwitchAccount | null>(null);
  const [password, setPassword] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const isOwner = userId === SWITCH_OWNER_ID;
  useEffect(() => {
    function sync() {
      const device = readDeviceAccounts(getSupabasePublicEnv().url);
      setEnabled(Boolean(device));
      setSavedIds(device?.accounts.map(a => a.id) ?? []);
    }
    sync();
    window.addEventListener(DEVICE_ACCOUNTS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(DEVICE_ACCOUNTS_CHANGED, sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  function close() { if (!busy) { dialog.current?.close(); setOpen(false); setTarget(null); setPassword(""); setError(null); } }
  async function show() {
    setOpen(true); setLoading(true); setError(null);
    try {
      const session = await loadCachedSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/account/switcher", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { accounts?: SwitchAccount[]; error?: string };
      if (!response.ok || !result.accounts) throw new Error(result.error ?? "Could not load accounts.");
      setAccounts(result.accounts);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load accounts."); }
    finally { setLoading(false); }
  }
  async function enable() {
    setError(null);
    try {
      const session = await loadCachedSession();
      if (!session || session.user.id !== userId) throw new Error("Please sign in again.");
      enableDeviceAccounts(getSupabasePublicEnv().url, session);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save sign-ins on this device."); }
  }
  async function choose(account: SwitchAccount, credentials?: { email: string; password: string }) {
    setError(null); setBusy(account.id);
    try { await switchDeviceAccount(account.id, slug, credentials); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not switch accounts."); }
    finally { setBusy(null); setPassword(""); }
  }
  function signIn(event: FormEvent) { event.preventDefault(); if (target) void choose(target, { email: target.email, password }); }
  async function googleSignIn() {
    if (!target || !isOwner) return;
    setBusy(target.id); setError(null); setPassword("");
    try {
      const returnTo = `/m/${slug}/account`;
      const callback = browserHref(`/m/${slug}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`, slug, window.location.hostname);
      const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google", options: {
          redirectTo: `${window.location.origin}${callback}`,
          queryParams: { prompt: "select_account", login_hint: target.email },
        },
      });
      if (signInError) throw signInError;
    } catch { setError("Could not open Google sign-in. Try again."); setBusy(null); }
  }
  if (!isSwitchAccount(userId) || (!isOwner && !enabled)) return null;
  return <>
    <button type="button" onClick={() => void show()} className="flex min-h-12 w-full items-center justify-between border-y border-[#E3E8EC] py-3 text-left text-sm font-medium text-[#26323A] active:bg-[#E3ECE7] focus-visible:outline-2 focus-visible:outline-[#17624F]">
      <span>Switch account</span><span aria-hidden>⇄</span>
    </button>
    {open ? createPortal(
      <dialog ref={dialog} aria-label="Switch account" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#D6DCE0] bg-white p-0 text-[#26323A] shadow-xl backdrop:bg-black/40">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">Switch account</h2><button type="button" onClick={close} disabled={Boolean(busy)} aria-label="Close" className="min-h-10 min-w-10 rounded-lg text-2xl active:bg-[#E3ECE7] focus-visible:outline-2">×</button></div>
          {loading ? <p className="py-6 text-sm text-[#52616A]">Loading accounts…</p> : !enabled ? <>
            <p className="mt-3 text-sm leading-6 text-[#52616A]">Save these four sign-ins in this browser or installed app. This option will stay hidden on the teachers’ other devices.</p>
            <p className="mt-2 text-sm leading-6 text-[#52616A]">Anyone using this device could access the saved accounts. Passwords are never saved.</p>
            <button type="button" onClick={() => void enable()} disabled={accounts.length === 0} className="mt-5 min-h-11 rounded-lg bg-[#17624F] px-5 font-medium !text-white active:bg-[#104B3B] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">Set up this device</button>
          </> : target ? <form onSubmit={signIn} className="mt-4 space-y-4">
            <div><p className="font-medium">{target.name} · {target.role}</p><p className="mt-1 break-all text-sm text-[#52616A]">{target.email}</p></div>
            <p className="text-sm leading-6 text-[#52616A]">Sign in once to save this account here. Use its existing password or select the account with Google.</p>
            <label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={Boolean(busy)} className="mt-2 min-h-11 w-full rounded-lg border border-[#B9C3C8] px-3 focus:outline-2 focus:outline-[#17624F]" /></label>
            <div className="flex gap-3"><button type="submit" disabled={Boolean(busy)} className="min-h-11 rounded-lg bg-[#17624F] px-5 font-medium !text-white active:bg-[#104B3B] disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button><button type="button" disabled={Boolean(busy)} onClick={() => { setTarget(null); setPassword(""); setError(null); }} className="min-h-11 px-3 underline underline-offset-4">Back</button></div>
            <button type="button" disabled={Boolean(busy)} onClick={() => void googleSignIn()} className="min-h-11 w-full rounded-lg border border-[#B9C3C8] px-4 text-sm font-medium active:bg-[#E3ECE7] disabled:opacity-50">Continue with Google</button>
          </form> : <>
            <p className="mt-2 text-sm text-[#52616A]">Saved on this device only.</p>
            <ul className="mt-4 divide-y divide-[#E3E8EC]">{accounts.map(account => {
              const current = account.id === userId;
              const saved = savedIds.includes(account.id);
              return <li key={account.id} className="py-1">
                <button type="button" disabled={Boolean(busy) || current || (!saved && !isOwner)} onClick={() => saved ? void choose(account) : setTarget(account)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left active:bg-[#E3ECE7] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-[#17624F]">
                  <span><span className="block font-medium">{account.name}</span><span className="mt-1 block text-sm text-[#52616A]">{account.role}</span></span>
                  <span className="text-sm text-[#52616A]">{busy === account.id ? "Opening…" : current ? "Current" : saved ? "Switch" : isOwner ? "Sign in" : "Not saved"}</span>
                </button>
                {!current && isOwner && saved ? <button type="button" disabled={Boolean(busy)} onClick={() => { removeDeviceAccount(getSupabasePublicEnv().url, account.id); setError(null); }} className="mb-2 ml-2 min-h-9 text-xs text-[#52616A] underline underline-offset-4">Remove saved sign-in</button> : null}
              </li>;
            })}</ul>
            {isOwner ? <button type="button" disabled={Boolean(busy)} onClick={() => { forgetDeviceAccounts(getSupabasePublicEnv().url); close(); }} className="mt-4 min-h-10 text-sm text-[#A23E34] underline underline-offset-4">Forget saved accounts on this device</button> : null}
          </>}
          {error ? <p role="alert" className="mt-4 text-sm leading-6 text-[#A23E34]">{error}</p> : null}
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
