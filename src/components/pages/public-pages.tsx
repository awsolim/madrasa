"use client";

import Image from "next/image";
import Link from "next/link";
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
      <PageTitleBar title="Classes" subtitle="Find weekly classes, workshops, and circles." tone="teal" />
      <PublicWorkspace>
        <PublicProgramsData slug={slug} />
      </PublicWorkspace>
    </>
  );
}

export function GuestProgramsPage({ slug, mosqueName, mosqueLogoUrl }: { slug: string; mosqueName: string; mosqueLogoUrl: string }) {
  return (
    <main className="min-h-screen bg-[var(--workspace)]">
      <header className="sticky top-0 z-30 border-b border-[#E4E9EC] bg-white/95 backdrop-blur">
        <div className="app-container flex min-h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#E1E7E4] bg-white p-1">
              <Image src={mosqueLogoUrl} alt={`${mosqueName} logo`} width={40} height={40} className="h-full w-full object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#26323A]">{mosqueName}</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-[#7B858C]">Guest preview</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/m/${slug}/login?returnTo=${encodeURIComponent(`/m/${slug}/explore`)}`} className="hidden min-h-10 items-center justify-center px-3 text-sm font-semibold text-[#35574D] sm:inline-flex">
              Log in
            </Link>
            <Link href={`/m/${slug}/signup?returnTo=${encodeURIComponent(`/m/${slug}/explore`)}`} className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#17624F] px-4 text-xs font-semibold !text-white sm:px-5 sm:text-sm">
              Create account
            </Link>
          </div>
        </div>
      </header>
      <PageTitleBar title="Explore Classes" tone="teal" />
      <PublicWorkspace>
        <div className="border-b border-[#E5EAEC] bg-white px-5 pb-1 pt-6 text-center">
        </div>
        <PublicProgramsData slug={slug} detailReturnTo={`/m/${slug}/explore`} />
      </PublicWorkspace>
    </main>
  );
}

export function PublicProgramDetailPage({ programId, slug, returnTo }: { programId: string; slug: string; returnTo?: string }) {
  const backLabel = "Classes";
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
      <PageTitleBar title="Apply" backHref={`/m/${slug}/programs/${programId}`} backLabel="Class" tone="teal" />
      <PublicWorkspace>
        <ProgramApplyData slug={slug} programId={programId} />
      </PublicWorkspace>
    </>
  );
}
