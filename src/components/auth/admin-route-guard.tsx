"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadUserAccessByMosqueSlug } from "@/lib/authz";

type GuardState = "checking" | "allowed" | "denied";

export function AdminRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const access = await loadUserAccessByMosqueSlug(slug);
      if (cancelled) {
        return;
      }

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
  }, [router, slug]);

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
