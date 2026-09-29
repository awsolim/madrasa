"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
        setShouldRender(true);
      }
    }

    resolveRoute();

    return () => {
      cancelled = true;
    };
  }, [adminHref, router, slug, teacherHref, attempt]);

  if (accessError) return <div className="p-6 text-center"><p role="alert">{accessError}</p><button className="mt-4 rounded-lg border px-5 py-3" onClick={() => { setAccessError(null); setAttempt(value => value + 1); }}>Try again</button></div>;

  if (!shouldRender) {
    return null;
  }

  return <>{children}</>;
}
