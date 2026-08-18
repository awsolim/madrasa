"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--workspace)] px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#DDE7E2] border-t-[#2F6F5B]" aria-label="Checking access" />
    </main>
  );
}
