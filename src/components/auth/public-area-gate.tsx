"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppChrome } from "@/components/layout/page-shell";
import { getDefaultLandingHref } from "@/lib/authz";
import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";
import { browserHref } from "@/lib/navigation-paths";

type GateState = "checking" | "redirecting" | "signed-in" | "signed-out" | "error";

export function PublicAreaGate({
  children,
  slug,
  mosqueName,
  mosqueLogoUrl,
}: {
  children: React.ReactNode;
  slug: string;
  mosqueName: string;
  mosqueLogoUrl: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }
      if (!session?.user.id) {
        setState("signed-out");
        return;
      }

      // The installed PWA opens at the tenant root. Resolve the account before
      // rendering any role-specific shell so an admin or teacher never sees the
      // student home and Inbox navigation while their access is still loading.
      if (pathname === "/" || pathname === `/m/${slug}` || pathname === `/m/${slug}/`) {
        const access = await loadCachedUserAccess(slug, session.user.id);
        if (cancelled) return;
        if (access.resolutionError) {
          setState("error");
          return;
        }
        setState("redirecting");
        router.replace(browserHref(getDefaultLandingHref(slug, access), slug, window.location.hostname));
        return;
      }

      setState("signed-in");
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, slug]);

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
      <main className="relative min-h-[100svh] overflow-hidden bg-[#F5F1E8] text-[#20352F]">
        <div className="pointer-events-none absolute inset-0 opacity-45" aria-hidden>
          <svg className="h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
            <path d="M-80 790C180 510 373 455 620 573C866 691 1084 629 1520 170" stroke="#C8B98E" strokeWidth="1.2" />
            <path d="M-110 844C164 556 370 507 614 622C859 737 1111 661 1540 219" stroke="#C8B98E" strokeWidth="1.2" />
            <circle cx="1265" cy="118" r="180" stroke="#D7CBA9" />
            <circle cx="1265" cy="118" r="128" stroke="#D7CBA9" />
          </svg>
        </div>

        <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1180px] flex-col px-5 pb-8 pt-[max(22px,env(safe-area-inset-top))] sm:px-8 lg:px-12 lg:pb-10">
          <header className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D7CFBA] bg-white p-1.5 shadow-[0_8px_24px_rgba(40,56,49,0.08)]">
                <Image src={mosqueLogoUrl} alt={`${mosqueName} logo`} width={48} height={48} className="h-full w-full object-contain" priority />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-5 text-[#20352F]">{mosqueName}</span>
                <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-[#78847E]">Community learning</span>
              </span>
            </div>
            <span className="hidden text-xs text-[#78847E] sm:block">Powered by <span className="font-semibold text-[#395F53]">Madrasa</span></span>
          </header>

          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.72fr)] lg:gap-20 lg:py-14">
            <section className="relative max-w-2xl">
              <div className="mb-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8B6F36]">
                <span className="h-px w-10 bg-[#B99C60]" />
                Welcome
              </div>
              <h1 className="max-w-xl text-[clamp(2.7rem,8vw,5.4rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-[#173E33]">
                Learn, grow,<br />and belong.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#566760] sm:text-lg sm:leading-8">
                Your place to discover classes at {mosqueName}, register your family, and stay connected to your learning community.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href={`/m/${slug}/signup?returnTo=${returnTo}`}
                  className="group inline-flex min-h-13 items-center justify-center gap-3 rounded-full bg-[#17624F] px-7 text-sm font-semibold !text-white shadow-[0_12px_30px_rgba(23,98,79,0.2)] transition hover:bg-[#125443]"
                >
                  Create an account
                </Link>
                <Link
                  href={`/m/${slug}/login?returnTo=${returnTo}`}
                  className="inline-flex min-h-13 items-center justify-center rounded-full border border-[#B9B29F] bg-white/55 px-7 text-sm font-semibold text-[#294A40] transition hover:border-[#7D8D86] hover:bg-white"
                >
                  I already have an account
                </Link>
              </div>
              <Link
                href={`/m/${slug}/explore`}
                className="group mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#C9B981] bg-[#F8F4E9]/70 px-6 text-sm font-semibold text-[#5E512D] transition hover:border-[#A8945B] hover:bg-[#FFFDF7] sm:w-auto"
              >
                Browse {mosqueName}&apos;s classes as a guest
              </Link>
            </section>

            <aside className="relative overflow-hidden rounded-[32px_32px_32px_8px] bg-[#173E33] px-6 py-8 text-white shadow-[0_28px_70px_rgba(35,57,49,0.18)] sm:px-8 sm:py-10">
              <GateArchPattern />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D5C58E]">One account is all you need</p>
                <h2 className="mt-3 max-w-sm text-2xl font-semibold leading-tight tracking-[-0.02em]">Begin your family’s learning journey.</h2>
                <ol className="mt-8 space-y-6">
                  <WelcomeStep number="01" title="Explore what’s offered" text="See current classes, schedules, age groups, and fees." />
                  <WelcomeStep number="02" title="Add your family" text="Keep children and registrations together in one secure place." />
                  <WelcomeStep number="03" title="Register and stay informed" text="Apply to programs and receive updates from instructors." />
                </ol>
              </div>
            </aside>
          </div>

          <footer className="flex items-center justify-between border-t border-[#D9D1BF] pt-5 text-[11px] text-[#7B817B]">
            <span>Private and secure for your community</span>
            <span className="sm:hidden">Powered by <span className="font-semibold text-[#395F53]">Madrasa</span></span>
          </footer>
        </div>
      </main>
    );
  }

  if (state === "error") {
    return (
      <TenantBootState mosqueName={mosqueName} mosqueLogoUrl={mosqueLogoUrl} message="We could not open your account." onRetry={() => window.location.reload()} />
    );
  }

  return <TenantBootState mosqueName={mosqueName} mosqueLogoUrl={mosqueLogoUrl} />;
}

function TenantBootState({ mosqueName, mosqueLogoUrl, message = "Opening your account", onRetry }: { mosqueName: string; mosqueLogoUrl: string; message?: string; onRetry?: () => void }) {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#F1F5F3] px-6 text-[#20352F]" aria-label="Opening your account" aria-busy="true">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#CEDBD6] bg-white p-2 shadow-[0_14px_36px_rgba(35,57,49,0.12)]">
          <Image src={mosqueLogoUrl} alt="" width={80} height={80} className="h-full w-full object-contain" priority />
        </span>
        <p className="mt-5 text-lg font-semibold tracking-[-0.01em]">{mosqueName}</p>
        <p className="mt-1 text-sm text-[#6D7B75]">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-6 min-h-11 rounded-full bg-[#17624F] px-6 text-sm font-semibold text-white">Try again</button>
        ) : (
          <div className="mt-7 h-1 w-32 overflow-hidden rounded-full bg-[#DCE6E2]" aria-hidden>
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-[#17624F]" />
          </div>
        )}
      </div>
    </main>
  );
}

function WelcomeStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="grid grid-cols-[34px_1fr] gap-4">
      <span className="pt-0.5 text-xs font-semibold tracking-[0.12em] text-[#D5C58E]">{number}</span>
      <span className="border-l border-white/15 pl-4">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-white/65">{text}</span>
      </span>
    </li>
  );
}

function GateArchPattern() {
  return (
    <svg className="pointer-events-none absolute -right-16 -top-12 h-72 w-72 text-white/[0.055]" viewBox="0 0 280 280" fill="none" aria-hidden>
      <path d="M140 12C140 12 62 73 62 151V274H218V151C218 73 140 12 140 12Z" stroke="currentColor" strokeWidth="2" />
      <path d="M140 48C140 48 92 88 92 151V274H188V151C188 88 140 48 140 48Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="140" cy="151" r="18" stroke="currentColor" strokeWidth="2" />
      <path d="M140 133V169M122 151H158M127 138L153 164M153 138L127 164" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
