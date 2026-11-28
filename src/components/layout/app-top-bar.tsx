"use client";

import Image from "next/image";
import Link from "@/components/layout/workspace-link";
import { useWorkspacePathname as usePathname, useWorkspaceRouter as useRouter } from "@/components/layout/workspace-navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { NavItem } from "@/components/layout/horizontal-nav";
import { useStudentNotificationCounts, useTeacherNotificationCounts } from "@/hooks/use-notification-counts";
import { emptyUserAccess, getAccountLabel, type UserAccess } from "@/lib/authz";
import {
  getCachedMosqueChrome,
  getCachedProfileName,
  getCachedSessionSnapshot,
  getCachedUserAccess,
  loadCachedProfileName,
  loadCachedSession,
  loadCachedUserAccess,
  loadMosqueChrome,
  subscribeCachedSession,
} from "@/lib/client-cache";
import { isPublicClassesRoot, primaryNavLabels } from "@/lib/navigation-paths";
import { ScheduleIcon } from "@/components/ui/schedule-icon";
import { cn } from "@/lib/utils";
import { useStandaloneMode } from "@/lib/pwa/install";
import { useDismissMenu } from "@/hooks/use-dismiss-menu";
import { useMobileNavViewport } from "@/hooks/use-mobile-nav-viewport";

function BottomNav({ items, inboxBadgeCount = 0, inboxActionRequired = false }: { items: NavItem[]; inboxBadgeCount?: number; inboxActionRequired?: boolean }) {
  const standalone = useStandaloneMode();
  const pathname = usePathname();
  const router = useRouter();
  const overlayChromeHidden = useOverlayChromeHidden();
  const itemByLabel = new Map(items.map((item) => [item.label, item]));
  const visibleItems = primaryNavLabels
    .map((label) => itemByLabel.get(label))
    .filter((item): item is NavItem => Boolean(item));
  const shouldShow = !overlayChromeHidden && isMainTabRoute(pathname, visibleItems);
  const navRef = useRef<HTMLElement | null>(null);
  useMobileNavViewport(navRef, standalone === true && shouldShow, pathname);

  useEffect(() => {
    for (const item of items) {
      router.prefetch(item.href);
    }
  }, [items, router]);

  if (standalone !== true || !shouldShow) {
    return null;
  }

  // A body portal keeps the viewport as the containing block even if a page or
  // router wrapper acquires clipping, containment or a transform. Avoid GPU/paint
  // containment on this fixed element: Safari can detach that layer while scrolling.
  return createPortal(
    <nav
      ref={navRef}
      className="pointer-events-auto fixed inset-x-0 z-[2147483647] h-[calc(88px+env(safe-area-inset-bottom))] overflow-visible bg-transparent md:hidden"
      style={{ top: "calc(var(--mobile-nav-viewport-bottom, 100dvh) - 88px - env(safe-area-inset-bottom))" }}
      aria-label="Mobile primary navigation"
    >
      <div aria-hidden className="pointer-events-auto absolute inset-0 bg-gradient-to-b from-transparent via-[#E7ECEE]/75 to-[#DDE4E7]/95" />
      <div aria-hidden className="pointer-events-auto absolute inset-x-0 bottom-0 h-[calc(58px+env(safe-area-inset-bottom))] bg-[#E3E9EB]/55" />
      <div
        className={cn(
          "absolute inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] mx-auto grid h-[68px] max-w-[420px] overflow-hidden rounded-[24px] border border-[#BCC8CD]/80",
          "bg-[#E3E9EB]/95 shadow-[0_12px_36px_rgba(38,50,58,0.24)]",
        )}
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const active = isNavItemActive(pathname, item);
          const badgeCount = item.label === "Inbox" ? inboxBadgeCount : 0;
          const actionRequired = item.label === "Inbox" ? inboxActionRequired : false;
          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (pathname === item.href) {
                  event.preventDefault();
                  router.push(item.href, { scroll: false });
                  window.scrollTo({ top: 0, behavior: "instant" });
                  return;
                }

                event.preventDefault();
                router.push(item.href);
              }}
              className={cn(
                "relative flex h-[68px] min-w-0 flex-col items-center justify-start px-1 pt-1.5 text-[11px] font-medium text-[var(--text-subtle)] transition-colors active:bg-white/55",
                active && "text-[var(--brand-green)]",
              )}
            >
              <span
                className="relative flex h-9 w-[52px] shrink-0 items-center justify-center"
                aria-hidden
              >
                <span className="relative flex h-9 w-[52px] items-center justify-center">
                <NavIcon label={item.label} active={active} />
                <NavBadge count={badgeCount} actionRequired={actionRequired} />
                </span>
              </span>
              <span className="mt-0.5 block h-4 w-full truncate text-center leading-4">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>, document.body
  );
}

export function MobileBottomNav({
  mosqueSlug,
  navItems,
  mobileNavItems,
}: {
  mosqueSlug?: string;
  navItems: NavItem[];
  mobileNavItems?: NavItem[];
}) {
  const resolvedItems = mobileNavItems ?? navItems;
  const portalInboxHref = mosqueSlug ? `/m/${mosqueSlug}/portal/announcements` : "";
  const teacherInboxHref = mosqueSlug ? `/m/${mosqueSlug}/teacher/inbox` : "";
  const showStudentBadges = Boolean(resolvedItems.some((item) => item.label === "Inbox" && item.href === portalInboxHref));
  const showTeacherBadges = Boolean(resolvedItems.some((item) => item.label === "Inbox" && item.href === teacherInboxHref));
  const { totalCount: studentTotalCount, actionRequired: studentActionRequired } = useStudentNotificationCounts(showStudentBadges ? (mosqueSlug ?? "") : "");
  const { totalCount: teacherTotalCount, actionRequired: teacherActionRequired } = useTeacherNotificationCounts(showTeacherBadges ? (mosqueSlug ?? "") : "");
  const inboxBadgeCount = showStudentBadges ? studentTotalCount : showTeacherBadges ? teacherTotalCount : 0;
  const inboxActionRequired = showStudentBadges ? studentActionRequired : showTeacherBadges ? teacherActionRequired : false;

  return <BottomNav items={resolvedItems} inboxBadgeCount={inboxBadgeCount} inboxActionRequired={inboxActionRequired} />;
}

// Same-route full-screen overlays (e.g. ApplicationReviewOverlay) never change the
// pathname, so isMainTabRoute alone can't tell the chrome to hide for them. Overlays
// dispatch this event on mount/unmount to force-hide the top bar and bottom nav regardless
// of route, independent of the tareeqah:nav-preview transition-only signal below.
function useOverlayChromeHidden() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const activeOverlayCountRef = useRef(0);

  useEffect(() => {
    activeOverlayCountRef.current = 0;
    setHidden(false);
  }, [pathname]);

  useEffect(() => {
    function handleOverlayChrome(event: Event) {
      const detail = (event as CustomEvent<{ hidden?: boolean }>).detail;
      if (detail?.hidden) {
        activeOverlayCountRef.current += 1;
      } else {
        activeOverlayCountRef.current = Math.max(0, activeOverlayCountRef.current - 1);
      }
      setHidden(activeOverlayCountRef.current > 0);
    }

    window.addEventListener("tareeqah:overlay-chrome", handleOverlayChrome);
    return () => window.removeEventListener("tareeqah:overlay-chrome", handleOverlayChrome);
  }, []);

  return hidden;
}

function isNavItemActive(pathname: string, item: NavItem) {
  if (item.label === "Classes" && isPublicClassesRoot(pathname, item.href)) return true;
  const hrefs = navItemPathCandidates(item.href);
  return hrefs.some((href) => pathname === href || (item.label !== "Schedule" && pathname.startsWith(`${href}/`)));
}

function NavBadge({ count, actionRequired = false }: { count?: number; actionRequired?: boolean }) {
  if (actionRequired) {
    return <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--brand-blue)] ring-2 ring-white" />;
  }
  if (count) {
    return (
      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(226,82,65,0.35)] ring-2 ring-white">
        {count > 9 ? "9+" : count}
      </span>
    );
  }
  return null;
}

function NavIcon({ label, active = false }: { label: string; active?: boolean }) {
  const className = "h-6 w-6";
  const strokeWidth = 1.8;

  if (label === "Schedule") return <ScheduleIcon className={className} active={active} />;

  if (active && label === "Classes") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M7.2 4.5h8.9a3.1 3.1 0 0 1 3.1 3.1v10.2a1.7 1.7 0 0 1-2.45 1.52l-4.45-2.2a.65.65 0 0 0-.58 0l-4.47 2.2A1.7 1.7 0 0 1 4.8 17.8V6.9a2.4 2.4 0 0 1 2.4-2.4Zm1.8 5a.8.8 0 0 0 0 1.6h6a.8.8 0 0 0 0-1.6H9Zm0 3.4a.8.8 0 0 0 0 1.6h4.1a.8.8 0 0 0 0-1.6H9Z" />
      </svg>
    );
  }

  if (active && label === "Inbox") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M6.1 5.25h11.8a2.85 2.85 0 0 1 2.85 2.85v7.8a2.85 2.85 0 0 1-2.85 2.85H6.1a2.85 2.85 0 0 1-2.85-2.85V8.1A2.85 2.85 0 0 1 6.1 5.25Zm.36 3.12 5.09 3.78a.75.75 0 0 0 .9 0l5.09-3.78a.72.72 0 1 0-.86-1.16L12 10.68 7.32 7.21a.72.72 0 0 0-.86 1.16Z" />
      </svg>
    );
  }

  if (active && label === "Members") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M9 10.7a3.35 3.35 0 1 0 0-6.7 3.35 3.35 0 0 0 0 6.7Z" />
        <path d="M3.15 18.9c.74-3.18 2.7-4.76 5.85-4.76s5.11 1.58 5.85 4.76a.82.82 0 0 1-.8 1H3.95a.82.82 0 0 1-.8-1Z" />
        <path d="M16.5 10.2a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" />
        <path d="M15.55 13.65c2.66.18 4.33 1.65 5.02 4.42a.72.72 0 0 1-.7.9h-3.62c-.24-1.7-.9-3.06-1.98-4.08.36-.5.79-.91 1.28-1.24Z" />
      </svg>
    );
  }

  if (active && label === "Masjid") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M5.4 10.2 12 4.4l6.6 5.8v8.15a2.15 2.15 0 0 1-2.15 2.15H7.55a2.15 2.15 0 0 1-2.15-2.15V10.2Z" />
        <path d="M9.1 9.15a2.9 2.9 0 0 1 5.8 0v2.2H9.1v-2.2Z" fill="white" opacity=".92" />
        <path d="M8.15 14.25h7.7v6.25h-7.7v-6.25Z" fill="white" opacity=".86" />
      </svg>
    );
  }

  if (active && label === "Profile") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M12 11.35a3.95 3.95 0 1 0 0-7.9 3.95 3.95 0 0 0 0 7.9Z" />
        <path d="M5.15 19.48c.87-3.62 3.16-5.44 6.85-5.44s5.98 1.82 6.85 5.44a.86.86 0 0 1-.84 1.07H5.99a.86.86 0 0 1-.84-1.07Z" />
      </svg>
    );
  }

  if (label === "Classes") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.35 6.95a2.4 2.4 0 0 1 2.4-2.4h8.5a2.4 2.4 0 0 1 2.4 2.4v10.75a1.2 1.2 0 0 1-1.72 1.08l-4.43-2.13a1.15 1.15 0 0 0-1 0l-4.43 2.13a1.2 1.2 0 0 1-1.72-1.08V6.95Z" />
        <path d="M8.8 9.35h6.4" />
        <path d="M8.8 12.85h4.4" />
      </svg>
    );
  }

  if (label === "Inbox") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.9" y="5.55" width="16.2" height="12.9" rx="2.4" />
        <path d="m5.9 8.25 5.58 4.15a.85.85 0 0 0 1.04 0l5.58-4.15" />
      </svg>
    );
  }

  if (label === "Members") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7.4" r="3.1" />
        <path d="M3.8 19.3c.75-3.35 2.48-5.02 5.2-5.02s4.45 1.67 5.2 5.02" />
        <circle cx="16.6" cy="8.1" r="2.45" />
        <path d="M15.45 14.2c2.1.3 3.5 1.7 4.2 4.2" />
      </svg>
    );
  }

  if (label === "Masjid") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.25 10.4 12 4.45l6.75 5.95v7.75a2.1 2.1 0 0 1-2.1 2.1H7.35a2.1 2.1 0 0 1-2.1-2.1V10.4Z" />
        <path d="M9.1 11.2V9.05a2.9 2.9 0 0 1 5.8 0v2.15" />
        <path d="M8.35 14.2h7.3" />
        <path d="M8.35 17.15h7.3" />
      </svg>
    );
  }

  if (label === "Profile") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7.75" r="3.65" />
        <path d="M5.25 19.75c.9-3.75 3.15-5.62 6.75-5.62s5.85 1.87 6.75 5.62" />
      </svg>
    );
  }

  return <span className="text-sm">{label[0]}</span>;
}

export function AppTopBar({
  appName,
  mosqueSlug,
  homeHref,
  navItems,
  mobileNavItems,
}: {
  appName: string;
  mosqueSlug?: string;
  homeHref: string;
  navItems: NavItem[];
  mobileNavItems?: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const standalone = useStandaloneMode();
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageMenuRef = useRef<HTMLDivElement>(null);
  useDismissMenu(pageMenuOpen, [pageMenuRef], () => setPageMenuOpen(false));
  const overlayChromeHidden = useOverlayChromeHidden();
  const showTopBar = !overlayChromeHidden && isMainTabRoute(pathname, mobileNavItems ?? navItems);
  const cachedChrome = mosqueSlug ? getCachedMosqueChrome(mosqueSlug) : null;
  const [displayName, setDisplayName] = useState(cachedChrome?.name ?? appName);
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedChrome?.logoUrl ?? null);
  const [chromeResolved, setChromeResolved] = useState(() => !mosqueSlug || Boolean(cachedChrome));
  const cachedSession = getCachedSessionSnapshot();
  const [session, setSession] = useState<Session | null | undefined>(cachedSession);
  const [access, setAccess] = useState<UserAccess>(() =>
    cachedSession?.user.id && mosqueSlug ? getCachedUserAccess(mosqueSlug, cachedSession.user.id) ?? emptyUserAccess : emptyUserAccess,
  );
  const [profileName, setProfileName] = useState<string | null>(() =>
    cachedSession?.user.id ? getCachedProfileName(cachedSession.user.id) ?? null : null,
  );
  const [accessResolved, setAccessResolved] = useState(() => {
    if (cachedSession === null) return true;
    return Boolean(cachedSession?.user.id && mosqueSlug && getCachedUserAccess(mosqueSlug, cachedSession.user.id));
  });
  const [profileResolved, setProfileResolved] = useState(() => {
    if (cachedSession === null) return true;
    return Boolean(cachedSession?.user.id && getCachedProfileName(cachedSession.user.id) !== undefined);
  });

  useEffect(() => {
    if (!mosqueSlug) {
      setDisplayName(appName);
      setLogoUrl(null);
      setChromeResolved(true);
      return;
    }

    let cancelled = false;

    const cachedChrome = getCachedMosqueChrome(mosqueSlug);

    if (cachedChrome) {
      setDisplayName(cachedChrome.name);
      setLogoUrl(cachedChrome.logoUrl);
      setChromeResolved(true);
    } else {
      setChromeResolved(false);
    }

    loadMosqueChrome(mosqueSlug).then((data) => {
      if (!cancelled) {
        if (data) {
          setDisplayName(data.name);
          setLogoUrl(data.logoUrl);
        }
        setChromeResolved(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mosqueSlug, appName]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeCachedSession((nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setAccess(emptyUserAccess);
        setProfileName(null);
        setAccessResolved(true);
        setProfileResolved(true);
      } else {
        setAccessResolved(false);
        setProfileResolved(false);
      }
    });

    loadCachedSession().then((nextSession) => {
      if (!cancelled) {
        setSession(nextSession);
      }
    }).catch(() => { /* The route guard handles connection recovery; do not invent a guest session. */ });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!session?.user.id || !mosqueSlug) {
      setAccess(emptyUserAccess);
      if (session === null) {
        setAccessResolved(true);
        setProfileResolved(true);
      }
      return () => {
        cancelled = true;
      };
    }

    Promise.all([
      loadCachedUserAccess(mosqueSlug, session.user.id),
      loadCachedProfileName(session.user.id),
    ]).then(([nextAccess, nextProfileName]) => {
      if (!cancelled) {
        setAccess(nextAccess);
        setProfileName(nextProfileName);
        setAccessResolved(true);
        setProfileResolved(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mosqueSlug, session]);

  useEffect(() => {
    if (!session?.user.id) {
      return;
    }

    let cancelled = false;
    const refreshProfileName = () => {
      loadCachedProfileName(session.user.id).then((nextProfileName) => {
        if (!cancelled) {
          setProfileName(nextProfileName);
        }
      });
    };

    window.addEventListener("tareeqah:profile-name-changed", refreshProfileName);
    return () => {
      cancelled = true;
      window.removeEventListener("tareeqah:profile-name-changed", refreshProfileName);
    };
  }, [session]);

  const userFirstName = useMemo(() => {
    const displayName = profileName?.trim() || session?.user.email?.replace(/@.*/, "") || "Guest";
    return displayName.split(/\s+/)[0] || "Guest";
  }, [profileName, session]);

  const accountLabel = useMemo(() => (session ? getAccountLabel(access) : session === null ? "Not signed in" : "Account"), [access, session]);
  const accountResolved = session !== undefined && (session === null || (accessResolved && profileResolved));
  const topBarReady = chromeResolved && accountResolved && standalone !== null;
  const resolvedMobileItems = mobileNavItems ?? navItems;
  const webMenuItems = primaryNavLabels
    .map((label) => resolvedMobileItems.find((item) => item.label === label))
    .filter((item): item is NavItem => Boolean(item));
  const currentPageIndex = webMenuItems.findIndex((item) => isNavItemActive(pathname, item));
  const currentPage = webMenuItems[currentPageIndex];

  if (!showTopBar || !topBarReady) {
    return null;
  }


  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E9EC] bg-white text-[var(--text-primary)] md:hidden">
      <div className="app-container grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-1">
        <Link href={homeHref} className="flex min-w-0 items-center gap-2">
          <TopBarLogo src={logoUrl} name={displayName} compact />
          <span className="min-w-0 truncate text-[13px] font-semibold leading-4 text-[var(--text-primary)]">{displayName}</span>
        </Link>
        <div className="flex flex-col items-center justify-center whitespace-nowrap text-[var(--text-subtle)]">
          <span className="text-[8px] font-medium leading-[9px]">Powered by</span>
          <span className="text-[9px] font-semibold leading-[10px]">Madrasa</span>
        </div>
        {standalone === false ? (
          <>
          <div className="flex min-w-0 flex-col items-end text-right leading-tight">
            <span className="max-w-full truncate text-xs font-semibold text-[#26323A]">{userFirstName}</span>
            {session ? <span className="max-w-full truncate text-[10px] text-[#6B747B]">{accountLabel}</span> : null}
          </div>
          <div ref={pageMenuRef} className="absolute right-[14px] top-[calc(100%-1px)] min-w-0">
            <button
              type="button"
              aria-label={`Choose page: ${currentPage?.label ?? "Navigate"}`}
              aria-expanded={pageMenuOpen}
              aria-controls="web-page-navigation"
              onClick={() => setPageMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                setPageMenuOpen(true);
                requestAnimationFrame(() => pageMenuRef.current?.querySelector<HTMLAnchorElement>("nav a")?.focus());
              }}
              className="press-feedback flex min-h-11 items-center gap-2 rounded-b-xl border-x border-b border-[#E4E9EC] bg-white px-4 pb-1 text-sm font-semibold text-[#294A40] shadow-[0_3px_4px_rgba(38,50,58,0.04)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17624F]"
            >
              <span>{currentPage?.label ?? "Navigate"}</span>
              <svg viewBox="0 0 20 20" className={cn("h-4 w-4 text-[#526A60]", pageMenuOpen && "rotate-180")} fill="none" aria-hidden>
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {pageMenuOpen ? (
              <nav id="web-page-navigation" aria-label="Choose page" className="absolute right-0 top-full z-40 mt-1 w-52 max-w-[calc(100vw-28px)] overflow-hidden rounded-xl border border-[#DCE4E1] bg-white p-1 shadow-[0_8px_24px_rgba(24,53,44,0.12)]"
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
                  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
                  links[(index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
                }}>
                {webMenuItems.map((item, index) => {
                  const active = index === currentPageIndex;
                  return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                    onClick={(event) => {
                      setPageMenuOpen(false);
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      if (active) {
                        router.push(item.href, { scroll: false });
                        return;
                      }
                      const direction = currentPageIndex >= 0 && index < currentPageIndex ? "from-left" : "from-right";
                      window.dispatchEvent(new CustomEvent("tareeqah:nav-preview", { detail: { href: item.href, label: item.label, direction, fromPath: pathname } }));
                      router.push(item.href);
                    }}
                    className={cn("press-feedback flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#17624F]", active ? "bg-[#F0F3F1] font-semibold text-[#17624F]" : "text-[#52616A] hover:bg-[#F5F6F5]")}>
                    <NavIcon label={item.label} active={active} />
                    <span className="flex-1">{item.label}</span>
                    {active ? <span aria-hidden>✓</span> : null}
                  </Link>;
                })}
              </nav>
            ) : null}
          </div>
          </>
        ) : (
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="flex min-w-0 max-w-full flex-col items-end justify-center leading-none">
              <span className="max-w-full truncate text-right text-[12px] font-semibold leading-[13px] text-[var(--text-primary)]">
                {userFirstName}
              </span>
              {session ? <span className="mt-px max-w-full truncate text-right text-[8px] font-medium leading-[9px] text-[var(--text-subtle)]">
                {accountLabel}
              </span> : null}
            </span>
        </div>
        )}
      </div>
    </header>
  );
}

function isMainTabRoute(pathname: string, items: NavItem[]) {
  const mainLabels = new Set<string>(primaryNavLabels);
  return items.some((item) => mainLabels.has(item.label) && (navItemPathCandidates(item.href).includes(pathname) || (item.label === "Classes" && isPublicClassesRoot(pathname, item.href))));
}

function navItemPathCandidates(href: string) {
  const paths = new Set([href]);
  const match = href.match(/^\/m\/[^/]+(\/.*)?$/);
  if (match) {
    paths.add(match[1] || "/");
  }
  return Array.from(paths);
}

function TopBarLogo({ src, name, compact = false }: { src: string | null; name: string; compact?: boolean }) {
  const sizeClass = compact ? "h-7 w-7" : "h-10 w-10";

  if (src) {
    return <Image src={src} alt={name} width={compact ? 28 : 40} height={compact ? 28 : 40} className={cn(sizeClass, "shrink-0 object-contain")} />;
  }

  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-[#F7F8F9] text-[#2E8F7D]", sizeClass)} aria-label={name}>
      <MosqueIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

function MosqueIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5v2.2" />
      <circle cx="12" cy="2" r="0.6" fill="currentColor" stroke="none" />
      <path d="M7.2 10.5a4.8 4.8 0 0 1 9.6 0" />
      <path d="M4.5 20.5v-7a1.6 1.6 0 0 1 3.2 0v7" />
      <path d="M16.3 20.5v-7a1.6 1.6 0 0 1 3.2 0v7" />
      <path d="M7.2 20.5v-10h9.6v10" />
      <path d="M10.5 20.5v-4a1.5 1.5 0 0 1 3 0v4" />
    </svg>
  );
}


