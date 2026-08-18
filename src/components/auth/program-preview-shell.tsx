"use client";

import { useEffect, useState } from "react";
import { AppChrome } from "@/components/layout/page-shell";
import { getCachedSessionSnapshot, loadCachedSession, subscribeCachedSession } from "@/lib/client-cache";

// A program detail page can be shared as a direct link (e.g. by a teacher) and must stay
// viewable without an account -- but only this one page, and only bare: no top bar, no
// bottom nav, no sidebar, and no way to browse anywhere else from it. Once signed in, the
// exact same route renders with full chrome like any other page in the app. This is the
// one deliberate, narrow exception to "no guest mode" -- everywhere else stays hard-gated.
export function ProgramPreviewShell({ children, slug }: { children: React.ReactNode; slug: string }) {
  const [session, setSession] = useState(() => getCachedSessionSnapshot());

  useEffect(() => {
    let cancelled = false;

    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    });

    const unsubscribe = subscribeCachedSession((nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (session?.user.id) {
    return (
      <AppChrome section="public" slug={slug}>
        {children}
      </AppChrome>
    );
  }

  return <>{children}</>;
}
