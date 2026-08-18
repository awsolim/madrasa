"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
          <p className="text-sm leading-6 text-[#68747C]">Log in or create an account to view classes and manage your family.</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/m/${slug}/login?returnTo=${returnTo}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#2F6F5B] px-5 text-sm font-semibold text-[#2F6F5B]"
            >
              Log In
            </Link>
            <Link
              href={`/m/${slug}/signup?returnTo=${returnTo}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#2F6F5B] px-5 text-sm font-semibold text-white"
            >
              Create Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--workspace)] px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#DDE7E2] border-t-[#2F6F5B]" aria-label="Checking access" />
    </main>
  );
}
