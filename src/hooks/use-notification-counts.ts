"use client";

import { useEffect, useState } from "react";
import type { NotificationCounts } from "@/lib/notifications/inbox";
import { getCachedSessionSnapshot, loadCachedSession, subscribeCachedSession } from "@/lib/client-cache";
import { invalidateQuery, useCachedQuery } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const emptyCounts: NotificationCounts = { announcementCount: 0, noteCount: 0, requestCount: 0, actionRequired: false };

async function fetchCounts(slug: string, audience: "student" | "teacher"): Promise<NotificationCounts> {
  const { data, error } = await createSupabaseBrowserClient().rpc("get_notification_counts", { p_slug: slug, p_audience: audience });
  if (error) throw error;
  return data as unknown as NotificationCounts;
}

// Keep identity in callers' cache keys; the RPC derives identity from auth.uid().
export function fetchStudentNotificationCounts(slug: string, _userId: string) {
  if (!_userId) return Promise.resolve(emptyCounts);
  return fetchCounts(slug, "student");
}
export function fetchTeacherNotificationCounts(slug: string, _userId: string) {
  if (!_userId) return Promise.resolve(emptyCounts);
  return fetchCounts(slug, "teacher");
}

function useSessionUserId() {
  const [session, setSession] = useState(() => getCachedSessionSnapshot());
  useEffect(() => {
    let cancelled = false;
    void loadCachedSession().then((next) => { if (!cancelled) setSession(next); });
    const unsubscribe = subscribeCachedSession(setSession);
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  return session?.user.id ?? null;
}

// Top bar, sidebar and home share a key. One event invalidates each key once.
// Account changes already change that key; token refresh is not a data change.
const watchedKeys = new Map<string, number>();
let lastResumeRefresh = 0;
function onNotificationsChanged() {
  for (const key of watchedKeys.keys()) invalidateQuery(key);
}
function onResume() {
  if (document.visibilityState !== "visible" || Date.now() - lastResumeRefresh < 20_000) return;
  lastResumeRefresh = Date.now();
  onNotificationsChanged();
}
function useNotificationChanges(key: string | null) {
  useEffect(() => {
    if (!key) return;
    if (watchedKeys.size === 0) {
      window.addEventListener("tareeqah:notifications-changed", onNotificationsChanged);
      document.addEventListener("visibilitychange", onResume);
      window.addEventListener("online", onResume);
    }
    watchedKeys.set(key, (watchedKeys.get(key) ?? 0) + 1);
    return () => {
      const remaining = (watchedKeys.get(key) ?? 1) - 1;
      if (remaining) watchedKeys.set(key, remaining);
      else watchedKeys.delete(key);
      if (!watchedKeys.size) {
        window.removeEventListener("tareeqah:notifications-changed", onNotificationsChanged);
        document.removeEventListener("visibilitychange", onResume);
        window.removeEventListener("online", onResume);
      }
    };
  }, [key]);
}

export function useStudentNotificationCounts(slug: string) {
  const userId = useSessionUserId();
  const key = slug && userId ? `notification-counts:student:${slug}:${userId}` : null;
  const { data } = useCachedQuery(key, () => fetchStudentNotificationCounts(slug, userId!), { staleTimeMs: 20_000 });
  useNotificationChanges(key);
  const counts = data ?? emptyCounts;
  const total = counts.announcementCount + counts.noteCount + counts.requestCount;
  return { ...counts, totalCount: counts.actionRequired ? Math.max(total, 1) : total };
}

export function useTeacherNotificationCounts(slug: string) {
  const userId = useSessionUserId();
  const key = slug && userId ? `notification-counts:teacher:${slug}:${userId}` : null;
  const { data } = useCachedQuery(key, () => fetchTeacherNotificationCounts(slug, userId!), { staleTimeMs: 20_000 });
  useNotificationChanges(key);
  const { requestCount, actionRequired } = data ?? emptyCounts;
  return { requestCount, actionRequired, totalCount: actionRequired ? Math.max(requestCount, 1) : requestCount };
}
