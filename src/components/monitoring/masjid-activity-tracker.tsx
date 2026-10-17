"use client";

import { useEffect } from "react";
import { loadCachedSession } from "@/lib/client-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function localDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MasjidActivityTracker({ slug }: { slug: string }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await loadCachedSession();
      if (cancelled || !session?.user.id) return;

      const storageKey = `madrasa:activity:${slug}:${session.user.id}:${localDateKey()}`;
      try {
        if (window.localStorage.getItem(storageKey) === "1") return;
      } catch {
        // Activity tracking still works when storage is unavailable.
      }

      const { error } = await createSupabaseBrowserClient().rpc("record_mosque_user_activity", { p_slug: slug });
      if (cancelled || error) return;
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // The database already deduplicates activity by profile and day.
      }
    })();

    return () => { cancelled = true; };
  }, [slug]);

  return null;
}
