"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";
import { emptyUserAccess } from "@/lib/authz";

type GuardState = "checking" | "allowed" | "denied";

export function AdminRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>("checking");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadCachedSession();
      const access = session ? await loadCachedUserAccess(slug, session.user.id) : emptyUserAccess;
      if (cancelled) {
        return;
      }
      if (access.resolutionError) { setAccessError(access.resolutionError); return; }

      if (access.isMosqueAdmin) {
        setState("allowed");
        return;
      }

      setState("denied");
      const fallbackHref = access.profileId ? `/m/${slug}` : `/m/${slug}/login`;
      router.replace(fallbackHref);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, slug, attempt]);

  if (accessError) return <main className="p-6 text-center"><p role="alert">{accessError}</p><button className="mt-4 rounded-lg border px-5 py-3" onClick={() => { setAccessError(null); setAttempt(value => value + 1); }}>Try again</button></main>;

  if (state === "allowed") {
    return <>{children}</>;
  }

  if (state === "denied") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--workspace)] px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-semibold text-[#26323A]">Admin access required</h1>
          <p className="text-sm leading-6 text-[#68747C]">This area is only available to active masjid admins.</p>
          <Link href={`/m/${slug}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#2F6F5B] px-5 text-sm font-semibold text-white">
            Go back
          </Link>
        </div>
      </main>
    );
  }

  return <QuietPageLoadingState />;
}
