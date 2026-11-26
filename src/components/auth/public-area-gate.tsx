"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppChrome } from "@/components/layout/page-shell";
import { getCachedMosqueChrome, loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";
import { TenantBootState } from "@/components/auth/tenant-startup-state";
import { accountConnectionMessage } from "@/components/auth/account-connection-error";
import { browserHref } from "@/lib/navigation-paths";
import { publicAccountDestination, publicPrimaryTab } from "@/lib/public-navigation";
import { useSessionIdentity } from "@/hooks/use-session-identity";

type GateState = "checking" | "redirecting" | "signed-in" | "signed-out" | "error";
const subscribeBranding = () => () => {};
const serverBranding = () => null;

export function PublicAreaGate({ children, slug, mosqueName, mosqueLogoUrl }: {
  children: React.ReactNode; slug: string; mosqueName: string; mosqueLogoUrl: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const sessionIdentity = useSessionIdentity();
  const [state, setState] = useState<GateState>("checking");
  const [attempt, setAttempt] = useState(0);
  const cachedBranding = useSyncExternalStore(subscribeBranding, () => getCachedMosqueChrome(slug), serverBranding);
  const tenantName = cachedBranding?.name && cachedBranding.name.toLowerCase() !== "madrasa" ? cachedBranding.name : mosqueName;
  const tenantLogoUrl = cachedBranding?.logoUrl || mosqueLogoUrl;

  useEffect(() => {
    let cancelled = false;
    // A failed account lookup must never establish a signed-out identity.
    const startupTimeout = setTimeout(() => { if (!cancelled) setState("error"); }, 10_000);
    void (async () => {
      const session = await loadCachedSession();
      if (cancelled) return;
      if (!session?.user.id) { setState("signed-out"); return; }
      // Public class details do not need an additional role/membership lookup.
      if (!publicPrimaryTab(pathname, slug)) { setState("signed-in"); return; }
      const access = await loadCachedUserAccess(slug, session.user.id);
      if (cancelled) return;
      if (access.resolutionError) { setState("error"); return; }
      const destination = publicAccountDestination(pathname, slug, access, search);
      if (destination) {
        setState("redirecting");
        router.replace(browserHref(destination, slug, window.location.hostname));
        return;
      }
      setState("signed-in");
    })().catch(() => { if (!cancelled) setState("error"); }).finally(() => clearTimeout(startupTimeout));
    return () => { cancelled = true; clearTimeout(startupTimeout); };
  }, [pathname, search, router, slug, sessionIdentity, attempt]);

  if ((state === "signed-in" && !publicPrimaryTab(pathname, slug)) || (state === "signed-out" && sessionIdentity === null)) {
    return <AppChrome section="public" slug={slug}>{children}</AppChrome>;
  }
  if (state === "error") {
    return <TenantBootState slug={slug} mosqueName={tenantName} mosqueLogoUrl={tenantLogoUrl} message={accountConnectionMessage}
      onRetry={() => { setState("checking"); setAttempt(value => value + 1); }} />;
  }
  return <TenantBootState mosqueName={tenantName} mosqueLogoUrl={tenantLogoUrl} />;
}
