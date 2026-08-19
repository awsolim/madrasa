"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Generalizes the module-level Map + in-flight-promise-dedup pattern already proven in
// client-cache.ts (session/access/profile caching) into a reusable "cache-and-revalidate"
// hook for any Supabase-backed data component. The goal: repeat visits to a page within the
// same app session render instantly from cache instead of re-fetching and showing a spinner
// every time, while a background refetch keeps the view from ever being far out of date.
//
// The in-memory Map alone only helps within one continuous session -- on a PWA that gets
// closed and reopened constantly (the normal way a phone app is used, not one long session),
// that Map is gone every time. So every entry is also mirrored to localStorage and rehydrated
// at module load, before any component's first render -- a fresh app open can show
// last-known data immediately instead of a blank shell, while a background refetch (the same
// staleness check as ever) quietly brings it current.

type CacheEntry<T> = { data: T; updatedAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const subscribers = new Map<string, Set<() => void>>();

const PERSIST_PREFIX = "madrasa:query-cache:";
// Skips persisting any entry over this size. Real list snapshots with several classes' worth
// of nested track/session data land well into the hundreds of KB even with zero images
// involved (measured ~400KB for a handful of classes) -- this is generous enough to cover
// that, while still excluding genuinely pathological cases (an embedded avatar as a base64
// data URI, or a mosque with an unusually large number of classes) rather than hand-picking
// which keys are "safe" to persist. localStorage.setItem's own quota error is still caught
// below as the last line of defense if the total ever exceeds what a browser allows.
const MAX_PERSIST_BYTES = 500_000;
// Never resurrect data older than this even as a flash of stale content before revalidation.
const MAX_PERSIST_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function persistedStorageKey(key: string) {
  return `${PERSIST_PREFIX}${key}`;
}

function persistEntry<T>(key: string, entry: CacheEntry<T>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const serialized = JSON.stringify({ data: entry.data, updatedAt: entry.updatedAt });
    if (serialized.length > MAX_PERSIST_BYTES) {
      return;
    }
    window.localStorage.setItem(persistedStorageKey(key), serialized);
  } catch {
    // Quota exceeded or storage unavailable (private browsing, etc.) -- the in-memory cache
    // still works, persistence is a best-effort enhancement, never load-bearing.
  }
}

function removePersistedEntry(key: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(persistedStorageKey(key));
  } catch {
    // best-effort
  }
}

function clearAllPersistedEntries() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const storageKey = window.localStorage.key(i);
      if (storageKey && storageKey.startsWith(PERSIST_PREFIX)) {
        toRemove.push(storageKey);
      }
    }
    for (const storageKey of toRemove) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // best-effort
  }
}

function hydrateFromStorage() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const now = Date.now();
    for (let i = 0; i < window.localStorage.length; i++) {
      const storageKey = window.localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(PERSIST_PREFIX)) {
        continue;
      }
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as { data: unknown; updatedAt: number };
        if (typeof parsed.updatedAt !== "number" || now - parsed.updatedAt > MAX_PERSIST_AGE_MS) {
          continue;
        }
        cache.set(storageKey.slice(PERSIST_PREFIX.length), { data: parsed.data, updatedAt: parsed.updatedAt });
      } catch {
        // One corrupt entry shouldn't block hydrating the rest.
      }
    }
  } catch {
    // best-effort
  }
}

// Runs once, at module load -- before any component using useCachedQuery ever renders, so
// the very first render of the very first page after a fresh app open can already be warm.
hydrateFromStorage();

function notify(key: string) {
  subscribers.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string, listener: () => void) {
  const set = subscribers.get(key) ?? new Set<() => void>();
  set.add(listener);
  subscribers.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      subscribers.delete(key);
    }
  };
}

async function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      const entry = { data, updatedAt: Date.now() };
      cache.set(key, entry);
      persistEntry(key, entry);
      notify(key);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Serves cached data instantly (no loading state) on remount within the same session, while
 * revalidating in the background once the entry is older than staleTimeMs. On a truly cold
 * key (never fetched this session), behaves like a plain useEffect fetch: loading until the
 * first result arrives.
 *
 * `key` may be null/undefined to skip fetching entirely (e.g. while waiting on a prerequisite
 * like a resolved user id) — the hook simply stays in the loading state until a real key shows up.
 */
function cacheSnapshot<T>(key: string | null | undefined) {
  const entry = key ? (cache.get(key) as CacheEntry<T> | undefined) : undefined;
  return { data: entry?.data, loading: !entry };
}

export function useCachedQuery<T>(
  key: string | null | undefined,
  fetcher: () => Promise<T>,
  options?: { staleTimeMs?: number },
): { data: T | undefined; loading: boolean; error: string | null; refetch: () => Promise<void> } {
  const staleTimeMs = options?.staleTimeMs ?? 30_000;
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [trackedKey, setTrackedKey] = useState(key);
  const [{ data, loading }, setSnapshot] = useState<{ data: T | undefined; loading: boolean }>(() => cacheSnapshot<T>(key));
  const [error, setError] = useState<string | null>(null);

  // React's documented pattern for resetting derived state when a prop changes: adjust state
  // synchronously during render (not in an effect) so the very first render for a new key
  // already reflects that key's cache, instead of flashing the previous key's data for a frame.
  if (trackedKey !== key) {
    setTrackedKey(key);
    setSnapshot(cacheSnapshot<T>(key));
    setError(null);
  }

  async function load(force: boolean) {
    if (!key) {
      return;
    }
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry && !force && Date.now() - entry.updatedAt < staleTimeMs) {
      return;
    }
    try {
      await runFetch(key, () => fetcherRef.current());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSnapshot((current) => ({ ...current, loading: false }));
    }
  }

  useEffect(() => {
    if (!key) {
      return;
    }

    const unsubscribe = subscribe(key, () => {
      setSnapshot({ data: (cache.get(key) as CacheEntry<T> | undefined)?.data, loading: false });
      setError(null);
    });

    // load()'s own setState calls only happen inside an awaited async continuation (the
    // catch block, or runFetch's .then()), never synchronously here — this kicks off a
    // background fetch/subscribe, matching the effect's job of syncing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Stable across re-renders for a given key -- callers that put `refetch` in an effect's
  // dependency array (e.g. re-subscribing to an event on change) must not have that effect
  // re-fire on every render just because refetch was a fresh closure each time. A previous
  // version of this returned a plain inline function here, which combined with exactly that
  // pattern elsewhere to create a real infinite refetch loop (subscribe -> fires once
  // immediately -> refetch -> re-render -> new closure -> re-subscribe -> repeat).
  const refetch = useCallback(async () => {
    setError(null);
    await load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error, refetch };
}

/** Drops one cached entry and notifies any mounted consumers to refetch on next read. */
export function invalidateQuery(key: string) {
  cache.delete(key);
  removePersistedEntry(key);
  notify(key);
}

/** Drops every cached entry whose key starts with `prefix` (e.g. all keys for one program). */
export function invalidateQueryPrefix(prefix: string) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removePersistedEntry(key);
      notify(key);
    }
  }
}

/** Fire-and-forget warm the cache ahead of navigation; safe to call outside a component. */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>) {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.updatedAt < 30_000) {
    return;
  }
  void runFetch(key, fetcher).catch(() => undefined);
}

/** Drops every cached query — called on sign-out so the next login never renders a stale
 * previous user's data from a shared in-memory cache within the same browser tab. Also
 * sweeps every persisted entry directly (not just ones currently in the in-memory map) —
 * now that the cache survives a closed app, a full sign-out must leave no trace on a
 * shared device for the next person who logs in. */
export function clearAllQueryCache() {
  for (const key of Array.from(cache.keys())) {
    cache.delete(key);
    notify(key);
  }
  clearAllPersistedEntries();
}
