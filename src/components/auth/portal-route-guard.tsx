"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession } from "@/lib/client-cache";
import { useSessionIdentity } from "@/hooks/use-session-identity";

export function PortalRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const router = useRouter();
  const sessionIdentity = useSessionIdentity();
  const [allowedUserId, setAllowedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }

      if (session?.user.id) {
        setAllowedUserId(session.user.id);
        return;
      }

      setAllowedUserId(null);
      router.replace(`/m/${slug}/login`);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, slug, sessionIdentity]);

  if (sessionIdentity && allowedUserId === sessionIdentity) {
    return <>{children}</>;
  }

  return <QuietPageLoadingState />;
}
