import type { Session } from "@supabase/supabase-js";
import { isSwitchAccount, SWITCH_OWNER_ID } from "./policy";

export type SavedSignIn = { id: string; accessToken: string; refreshToken: string };
type DeviceAccounts = { version: 1; ownerId: string; activeId: string | null; accounts: SavedSignIn[] };
export const DEVICE_ACCOUNTS_CHANGED = "madrasa:device-accounts";
function storageKey(url: string) { return `madrasa:device-accounts:${new URL(url).host}:v1`; }
export function readDeviceAccounts(url: string): DeviceAccounts | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(url)) ?? "null") as DeviceAccounts | null;
    if (!value || value.version !== 1 || value.ownerId !== SWITCH_OWNER_ID || !Array.isArray(value.accounts)) return null;
    return { ...value, accounts: value.accounts.filter(a => isSwitchAccount(a.id) && typeof a.accessToken === "string" && typeof a.refreshToken === "string") };
  } catch { return null; }
}
function write(url: string, value: DeviceAccounts) {
  window.localStorage.setItem(storageKey(url), JSON.stringify(value));
  window.dispatchEvent(new Event(DEVICE_ACCOUNTS_CHANGED));
}
export function rememberDeviceSession(url: string, session: Session, active = true) {
  const device = readDeviceAccounts(url);
  if (!device || !isSwitchAccount(session.user.id)) return;
  const account = { id: session.user.id, accessToken: session.access_token, refreshToken: session.refresh_token };
  write(url, { ...device, activeId: active ? account.id : device.activeId, accounts: [...device.accounts.filter(a => a.id !== account.id), account] });
}
export function enableDeviceAccounts(url: string, session: Session) {
  if (session.user.id !== SWITCH_OWNER_ID) throw new Error("Only Amr's admin account can set up switching on this device.");
  write(url, { version: 1, ownerId: SWITCH_OWNER_ID, activeId: session.user.id, accounts: [
    { id: session.user.id, accessToken: session.access_token, refreshToken: session.refresh_token },
  ] });
}
export function removeDeviceAccount(url: string, id: string) {
  const device = readDeviceAccounts(url);
  if (!device) return;
  write(url, { ...device, activeId: device.activeId === id ? null : device.activeId, accounts: device.accounts.filter(a => a.id !== id) });
}
export function forgetDeviceAccounts(url: string) {
  window.localStorage.removeItem(storageKey(url));
  window.dispatchEvent(new Event(DEVICE_ACCOUNTS_CHANGED));
}
