"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountConnectionError, accountConnectionMessage } from "@/components/auth/account-connection-error";
import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";

export function PortalRoleRedirect({
  slug,
  teacherHref,
  adminHref,
  children,
}: {
  slug: string;
  teacherHref: string;
  adminHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [shouldRender, setShouldRender] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startupTimeout = setTimeout(() => { if (!cancelled) setAccessError(accountConnectionMessage); }, 10_000);

    async function resolveRoute() {
      const session = await loadCachedSession();
      if (!session?.user.id) {
        router.replace(`/m/${slug}/login`);
        return;
      }

      const access = await loadCachedUserAccess(slug, session.user.id);
      if (cancelled) return;
      if (access.resolutionError) { setAccessError(access.resolutionError); return; }
      if (access.isTeacher) {
        router.replace(teacherHref);
        return;
      }

      if (access.isMosqueAdmin) {
        router.replace(adminHref);
        return;
      }

      if (!cancelled) {
        setAccessError(null);
        setShouldRender(true);
      }
    }

    void resolveRoute().catch(() => { if (!cancelled) setAccessError(accountConnectionMessage); }).finally(() => clearTimeout(startupTimeout));

    return () => {
      cancelled = true;
      clearTimeout(startupTimeout);
    };
  }, [adminHref, router, slug, teacherHref, attempt]);

  if (accessError) return <AccountConnectionError slug={slug} onRetry={() => { setAccessError(null); setAttempt(value => value + 1); }} />;

  if (!shouldRender) {
    return null;
  }

  return <>{children}</>;
}
