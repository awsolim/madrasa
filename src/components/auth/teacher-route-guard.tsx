"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountConnectionError, accountConnectionMessage } from "@/components/auth/account-connection-error";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";
import { useSessionIdentity } from "@/hooks/use-session-identity";

export function TeacherRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const sessionIdentity = useSessionIdentity();
  const [allowedUserId, setAllowedUserId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const startupTimeout = setTimeout(() => { if (active) setAccessError(accountConnectionMessage); }, 10_000);

    async function guardRoute() {
      const session = await loadCachedSession();
      if (!active) {
        return;
      }

      if (!session?.user.id) {
        router.replace(`/m/${slug}/login`);
        return;
      }

      const access = await loadCachedUserAccess(slug, session.user.id);
      if (!active) {
        return;
      }

      if (access.resolutionError) { setAccessError(access.resolutionError); return; }
      setAccessError(null);

      if (access.isTeacher || access.isMosqueAdmin) {
        setAllowedUserId(session.user.id);
        return;
      }

      router.replace(mapTeacherPathToPortal(pathname, slug));
    }

    void guardRoute().catch(() => { if (active) setAccessError(accountConnectionMessage); }).finally(() => clearTimeout(startupTimeout));

    return () => {
      active = false;
      clearTimeout(startupTimeout);
    };
  }, [pathname, router, slug, attempt, sessionIdentity]);

  if (accessError) return <AccountConnectionError slug={slug} onRetry={() => { setAccessError(null); setAttempt(value => value + 1); }} />;

  if (!sessionIdentity || allowedUserId !== sessionIdentity) {
    return <QuietPageLoadingState />;
  }

  return <>{children}</>;
}

function mapTeacherPathToPortal(pathname: string | null, slug: string) {
  const base = `/m/${slug}`;
  const path = pathname ?? `${base}/teacher`;

  if (path === `${base}/teacher`) {
    return `${base}/portal`;
  }

  if (path === `${base}/teacher/account`) {
    return `${base}/portal/account`;
  }

  if (path === `${base}/teacher/inbox`) {
    return `${base}/portal/announcements`;
  }

  if (path.startsWith(`${base}/teacher/classes`)) {
    const classPath = path.replace(`${base}/teacher/classes`, `${base}/portal/classes`);
    return classPath.replace(/\/(students|announcement)$/, "");
  }

  return `${base}/portal`;
}
