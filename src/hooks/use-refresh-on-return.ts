"use client";

import { useEffect } from "react";

// Primary workspace pages stay mounted while hidden. Refresh only when revealed
// or deliberately revisited, leaving cached content visible during the request.
// The query cache shares in-flight requests, including the initial page load.
export function useRefreshOnReturn(active: boolean, refetch: () => Promise<void>) {
  useEffect(() => {
    if (!active) return;
    const refresh = () => { void refetch(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("tareeqah:workspace-reselect", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("tareeqah:workspace-reselect", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refetch]);
}
