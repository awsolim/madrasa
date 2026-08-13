"use client";

import { PageTitleBar } from "@/components/layout/page-title-bar";
import { ProgramApplyData, ProgramDetailData, PublicMasjidData, PublicProgramsData } from "@/components/data/supabase-public-sections";
import { cn } from "@/lib/utils";

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
  return (
    <>
      <PageTitleBar title="Home" subtitle="Registration, schedules, and family class updates." />
      <PublicWorkspace>
        <PublicMasjidData slug={slug} />
      </PublicWorkspace>
    </>
  );
}

export function PublicProgramsPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Programs" subtitle="Find weekly classes, workshops, and circles." tone="teal" />
      <PublicWorkspace>
        <PublicProgramsData slug={slug} />
      </PublicWorkspace>
    </>
  );
}

export function PublicProgramDetailPage({ programId, slug, returnTo }: { programId: string; slug: string; returnTo?: string }) {
  const backLabel = returnTo?.includes("/admin/programs") || returnTo?.includes("/teacher/classes") || returnTo?.includes("/portal/classes") ? "Classes" : "Programs";
  return (
    <>
      <PageTitleBar title="Class Details" backHref={returnTo ?? `/m/${slug}/programs`} backLabel={backLabel} tone="teal" />
      <PublicWorkspace>
        <ProgramDetailData slug={slug} programId={programId} section="public" />
      </PublicWorkspace>
    </>
  );
}

export function ProgramApplyPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Apply to Register" backHref={`/m/${slug}/programs/${programId}`} backLabel="Program" tone="teal" />
      <PublicWorkspace>
        <ProgramApplyData slug={slug} programId={programId} />
      </PublicWorkspace>
    </>
  );
}
