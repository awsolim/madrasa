"use client";

import { useEffect, useState } from "react";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { ProgramApplyData, ProgramDetailData, PublicProgramsData } from "@/components/data/supabase-public-sections";
import { GuestAccountPage } from "@/components/pages/guest-account-page";
import { cn } from "@/lib/utils";
import { getClassesLandingHref, loadUserAccessByMosqueSlug } from "@/lib/authz";
import { loadCachedSession } from "@/lib/client-cache";

function PublicWorkspace({
  children,
  overlap = true,
  overlapOffset = "-172px",
  surfaceClassName = "bg-[var(--workspace)]",
}: {
  children: React.ReactNode;
  overlap?: boolean;
  overlapOffset?: string;
  surfaceClassName?: string;
}) {
  return (
    <div
      className={cn("relative z-10 min-h-[calc(100vh-260px)]", overlap ? "" : `${surfaceClassName} py-8`)}
      style={overlap ? { marginTop: overlapOffset } : undefined}
    >
      <div className={cn(overlap ? "min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px]" : "", surfaceClassName)}>{children}</div>
    </div>
  );
}

export function PublicMasjidPage({ slug }: { slug: string }) {
  return <GuestAccountPage slug={slug} tab="schedule" />;
}

export function PublicProgramsPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Classes" subtitle="Find weekly classes, workshops, and circles." tone="teal" />
      <PublicWorkspace>
        <PublicProgramsData slug={slug} />
      </PublicWorkspace>
    </>
  );
}

export function PublicProgramDetailPage({ programId, slug, returnTo }: { programId: string; slug: string; returnTo?: string }) {
  const backLabel = "Classes";
  const [signedInBackHref, setSignedInBackHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCachedSession().then(async (session) => {
      if (!session?.user.id || cancelled) {
        return;
      }
      const access = await loadUserAccessByMosqueSlug(slug);
      if (!cancelled) {
        setSignedInBackHref(getClassesLandingHref(slug, access));
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <>
      <PageTitleBar title="Class Details" backHref={signedInBackHref ?? returnTo ?? `/m/${slug}/programs`} backLabel={backLabel} tone="teal" />
      <PublicWorkspace>
        <ProgramDetailData slug={slug} programId={programId} section="public" />
      </PublicWorkspace>
    </>
  );
}

export function ProgramApplyPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Apply" backHref={`/m/${slug}/programs/${programId}`} backLabel="Class" tone="teal" />
      <PublicWorkspace>
        <ProgramApplyData slug={slug} programId={programId} />
      </PublicWorkspace>
    </>
  );
}
