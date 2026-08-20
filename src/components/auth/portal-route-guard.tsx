"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession } from "@/lib/client-cache";

type GuardState = "checking" | "allowed" | "denied";

export function PortalRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }

      if (session?.user.id) {
        setState("allowed");
        return;
      }

      setState("denied");
      router.replace(`/m/${slug}/login`);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, slug]);

  if (state === "allowed") {
    return <>{children}</>;
  }

  return <QuietPageLoadingState />;
}
