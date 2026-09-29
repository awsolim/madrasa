"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QuietPageLoadingState } from "@/components/data/data-loading";
import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";

export function TeacherRouteGuard({ children, slug }: { children: React.ReactNode; slug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

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

      if (access.isTeacher || access.isMosqueAdmin) {
        setIsAllowed(true);
        return;
      }

      router.replace(mapTeacherPathToPortal(pathname, slug));
    }

    void guardRoute();

    return () => {
      active = false;
    };
  }, [pathname, router, slug, attempt]);

  if (accessError) return <main className="p-6 text-center"><p role="alert">{accessError}</p><button className="mt-4 rounded-lg border px-5 py-3" onClick={() => { setAccessError(null); setAttempt(value => value + 1); }}>Try again</button></main>;

  if (!isAllowed) {
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
