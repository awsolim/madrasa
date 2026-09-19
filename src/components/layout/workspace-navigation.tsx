"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { browserHref, workspacePath, workspaceRoute, type WorkspaceSection } from "@/lib/navigation-paths";

const locationEvent = "tareeqah:workspace-location";
function subscribeLocation(listener: () => void) {
  window.addEventListener(locationEvent, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(locationEvent, listener);
    window.removeEventListener("popstate", listener);
  };
}

type Navigation = {
  pathname: string;
  href: (value: string) => string;
  isLocal: (value: string) => boolean;
  navigate: (href: string, replace?: boolean, scroll?: boolean) => boolean;
};
const WorkspaceNavigationContext = createContext<Navigation | null>(null);

// The finite set of workspace screens already ships as client components. Switching
// those screens should not wait for an RSC response. Next owns deep links, auth layouts,
// unknown routes and refreshes; its supported History API keeps URL/search/back in sync.
export function WorkspaceNavigationProvider({ slug, section, children }: {
  slug: string; section: WorkspaceSection; children: React.ReactNode;
}) {
  const nextPathname = usePathname();
  const searchParams = useSearchParams();
  const serverLocation = `${nextPathname}${searchParams.size ? `?${searchParams}` : ""}`;
  const location = useSyncExternalStore(subscribeLocation,
    () => `${window.location.pathname}${window.location.search}`, () => serverLocation);
  const hostname = useSyncExternalStore(subscribeLocation, () => window.location.hostname, () => "");
  const pathname = workspacePath(location.split("?")[0], slug);
  const href = useCallback((value: string) => browserHref(value, slug, hostname), [slug, hostname]);
  const isLocal = useCallback((value: string) => value.startsWith("/") && !value.startsWith("//") && Boolean(workspaceRoute(value.split(/[?#]/)[0], slug, section)), [slug, section]);
  const navigate = useCallback((value: string, replace = false, scroll = true) => {
    const target = new URL(value, window.location.href);
    if (target.origin !== window.location.origin || !workspaceRoute(target.pathname, slug, section)) return false;
    const destination = browserHref(`${target.pathname}${target.search}${target.hash}`, slug, window.location.hostname);
    if (destination === `${window.location.pathname}${window.location.search}${window.location.hash}`) return true;
    if (process.env.NEXT_PUBLIC_NAVIGATION_QA === "1") window.dispatchEvent(new CustomEvent("tareeqah:navigation-start", { detail: workspacePath(target.pathname, slug) }));
    // Update the actual screen and its selected tab in the same synchronous commit.
    if (replace) window.history.replaceState(null, "", destination);
    else window.history.pushState(null, "", destination);
    window.dispatchEvent(new Event(locationEvent));
    if (scroll) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return true;
  }, [section, slug]);
  useEffect(() => { window.dispatchEvent(new Event(locationEvent)); }, [nextPathname, searchParams]);
  const value = useMemo(() => ({ pathname, href, navigate, isLocal }), [pathname, href, navigate, isLocal]);
  return <WorkspaceNavigationContext.Provider value={value}>{children}</WorkspaceNavigationContext.Provider>;
}

export function useWorkspaceNavigation() { return useContext(WorkspaceNavigationContext); }

export function useWorkspacePathname() {
  const pathname = usePathname();
  return useWorkspaceNavigation()?.pathname ?? pathname;
}

export function useWorkspaceRouter() {
  const router = useRouter();
  const navigation = useWorkspaceNavigation();
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: { scroll?: boolean }) => {
      if (!navigation?.navigate(href, false, options?.scroll)) router.push(navigation?.href(href) ?? href, options);
    },
    replace: (href: string, options?: { scroll?: boolean }) => {
      if (!navigation?.navigate(href, true, options?.scroll)) router.replace(navigation?.href(href) ?? href, options);
    },
    prefetch: (href: string) => { if (!navigation?.isLocal(href)) router.prefetch(navigation?.href(href) ?? href); },
  }), [router, navigation]);
}
