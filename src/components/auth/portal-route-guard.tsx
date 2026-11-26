"use client";

import { useEffect, useState } from "react";
import { AccountConnectionError, accountConnectionMessage } from "@/components/auth/account-connection-error";
import { useRouter } from "next/navigation";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession } from "@/lib/client-cache";
import { useSessionIdentity } from "@/hooks/use-session-identity";

export function PortalRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const router = useRouter();
  const sessionIdentity = useSessionIdentity();
  const [allowedUserId, setAllowedUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startupTimeout = setTimeout(() => { if (!cancelled) setAccessError(accountConnectionMessage); }, 10_000);

    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }

      setAccessError(null);
      if (session?.user.id) {
        setAllowedUserId(session.user.id);
        return;
      }

      setAllowedUserId(null);
      router.replace(`/m/${slug}/login`);
    })().catch(() => { if (!cancelled) setAccessError(accountConnectionMessage); }).finally(() => clearTimeout(startupTimeout));

    return () => {
      cancelled = true;
      clearTimeout(startupTimeout);
    };
  }, [router, slug, sessionIdentity, attempt]);

  if (accessError) return <AccountConnectionError slug={slug} onRetry={() => { setAccessError(null); setAttempt(value => value + 1); }} />;

  if (sessionIdentity && allowedUserId === sessionIdentity) {
    return <>{children}</>;
  }

  return <QuietPageLoadingState />;
}
