"use client";

import { PortalAccountData, ProgramApplicationsData, ProgramFinancesData, TeacherAnnouncementData, TeacherClassesData, TeacherHomeData, TeacherInstructorsData, TeacherProgramCreateData, TeacherProgramSettingsData, TeacherScheduleData, TeacherStudentNotesData, TeacherStudentsData } from "@/components/data/supabase-public-sections";
import { TeacherInboxData } from "@/components/data/teacher-inbox";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { cn } from "@/lib/utils";

function TeacherWorkspace({
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
    <div className={cn("relative z-10 min-h-[calc(100vh-260px)]", overlap ? "" : `${surfaceClassName} py-8`)} style={overlap ? { marginTop: overlapOffset } : undefined}>
      <div className={cn(overlap ? "min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px]" : "", surfaceClassName)}>{children}</div>
    </div>
  );
}

export function TeacherDashboardPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Home" tone="teal" />
      <TeacherWorkspace>
        <TeacherHomeData slug={slug} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherClassesPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Classes" />
      <TeacherWorkspace>
        <TeacherClassesData slug={slug} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherAccountPage({ slug }: { slug: string }) {
  return <PortalAccountData slug={slug} />;
}

export function TeacherStudentsPage({ slug, programId, fromHome }: { slug: string; programId: string; fromHome?: boolean }) {
  return (
    <>
      {fromHome ? (
        <PageTitleBar title="Students" closeHref={`/m/${slug}/teacher`} closeLabel="Home" />
      ) : (
        <PageTitleBar title="Students" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" />
      )}
      <TeacherWorkspace>
        <TeacherStudentsData slug={slug} programId={programId} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherStudentNotesPage({ slug, programId, studentId }: { slug: string; programId: string; studentId: string }) {
  return (
    <>
      <PageTitleBar title="Student Notes" backHref={`/m/${slug}/teacher/classes/${programId}/students`} backLabel="Students" />
      <TeacherWorkspace>
        <TeacherStudentNotesData slug={slug} programId={programId} studentId={studentId} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherAnnouncementPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Announcement" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" />
      <TeacherWorkspace>
        <TeacherAnnouncementData slug={slug} programId={programId} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherProgramFinancesPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Finances" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" tone="teal" />
      <TeacherWorkspace surfaceClassName="bg-white">
        <ProgramFinancesData slug={slug} programId={programId} mode="teacher" />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherProgramApplicationsPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Applications" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" tone="teal" />
      <TeacherWorkspace surfaceClassName="bg-white">
        <ProgramApplicationsData slug={slug} programId={programId} mode="teacher" />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherSchedulePage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Schedule" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" />
      <TeacherWorkspace>
        <TeacherScheduleData slug={slug} programId={programId} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherInboxPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Inbox" tone="teal" />
      <TeacherWorkspace>
        <TeacherInboxData slug={slug} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherProgramDetailPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Edit Program" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" tone="teal" />
      <TeacherWorkspace>
        <TeacherProgramSettingsData slug={slug} programId={programId} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherProgramCreatePage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Add Class" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" tone="teal" />
      <TeacherWorkspace>
        <TeacherProgramCreateData slug={slug} />
      </TeacherWorkspace>
    </>
  );
}

export function TeacherInstructorsPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Instructors" backHref={`/m/${slug}/teacher/classes`} backLabel="Classes" tone="teal" centerBackTitle smallTitle />
      <TeacherWorkspace surfaceClassName="bg-white">
        <TeacherInstructorsData slug={slug} programId={programId} />
      </TeacherWorkspace>
    </>
  );
}

