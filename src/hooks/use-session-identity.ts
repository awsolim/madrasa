"use client";

import { useSyncExternalStore } from "react";
import { getCachedSessionSnapshot, subscribeCachedSession } from "@/lib/client-cache";

const subscribe = (onChange: () => void) => subscribeCachedSession(() => onChange());
const snapshot = () => {
  const session = getCachedSessionSnapshot();
  return session === undefined ? undefined : session?.user.id ?? null;
};
const serverSnapshot = () => undefined;

// React observes account identity, not every token refresh. Guards can react to
// real sign-out/account changes without rerunning permission checks each refresh.
export function useSessionIdentity() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
