"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GenericLoadingState } from "@/components/data/data-loading";
import { AppChrome } from "@/components/layout/page-shell";
import { loadCachedSession } from "@/lib/client-cache";

type GateState = "checking" | "signed-in" | "signed-out";

export function PublicAreaGate({ children, slug, mosqueName }: { children: React.ReactNode; slug: string; mosqueName: string }) {
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }
      setState(session?.user.id ? "signed-in" : "signed-out");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "signed-in") {
    return (
      <AppChrome section="public" slug={slug}>
        {children}
      </AppChrome>
    );
  }

  if (state === "signed-out") {
    const returnTo = encodeURIComponent(pathname || `/m/${slug}`);
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--workspace)] px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold text-[#26323A]">{mosqueName}</h1>
          <p className="text-sm leading-6 text-[#68747C]">Log in to view classes and manage your family.</p>
          <Link
            href={`/m/${slug}/login?returnTo=${returnTo}`}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#171717] px-5 text-sm font-semibold !text-white"
          >
            Log In
          </Link>
        </div>
      </main>
    );
  }

  return <GenericLoadingState label="Checking access" layout="management" />;
}
