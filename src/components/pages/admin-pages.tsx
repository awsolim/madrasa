"use client";

import { AdminClassesData, AdminHomeData, AdminMasjidData, AdminMasjidFinancesData, AdminMasjidInformationData, AdminMembersData, PortalAccountData, ProgramApplicationsData, ProgramFinancesData, TeacherAnnouncementData, TeacherInstructorsData, TeacherProgramCreateData, TeacherProgramSettingsData, TeacherStudentNotesData, TeacherStudentsData } from "@/components/data/supabase-public-sections";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { cn } from "@/lib/utils";

function AdminWorkspace({
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

export function AdminDashboardPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Home" tone="teal" />
      <AdminWorkspace>
        <AdminHomeData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramsPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Classes" tone="teal" />
      <AdminWorkspace>
        <AdminClassesData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminStudentsPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Members" tone="teal" />
      <AdminWorkspace>
        <AdminMembersData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminMasjidPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Masjid" tone="teal" />
      <AdminWorkspace>
        <AdminMasjidData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminMasjidInformationPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Masjid Information" backHref={`/m/${slug}/admin/masjid`} backLabel="Masjid" tone="teal" />
      <AdminWorkspace>
        <AdminMasjidInformationData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramDetailPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Edit Program" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" />
      <AdminWorkspace>
        <TeacherProgramSettingsData slug={slug} programId={programId} returnHref={`/m/${slug}/admin/programs`} />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramCreatePage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Add Class" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" />
      <AdminWorkspace>
        <TeacherProgramCreateData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminInstructorsPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Instructors" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" centerBackTitle smallTitle />
      <AdminWorkspace surfaceClassName="bg-white">
        <TeacherInstructorsData slug={slug} programId={programId} />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramStudentsPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Students" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" />
      <AdminWorkspace>
        <TeacherStudentsData slug={slug} programId={programId} />
      </AdminWorkspace>
    </>
  );
}

export function AdminStudentNotesPage({ slug, programId, studentId }: { slug: string; programId: string; studentId: string }) {
  return (
    <>
      <PageTitleBar title="Student Notes" backHref={`/m/${slug}/admin/programs/${programId}/students`} backLabel="Students" />
      <AdminWorkspace>
        <TeacherStudentNotesData slug={slug} programId={programId} studentId={studentId} />
      </AdminWorkspace>
    </>
  );
}

export function AdminAnnouncementPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Announcement" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" />
      <AdminWorkspace>
        <TeacherAnnouncementData slug={slug} programId={programId} />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramFinancesPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Finances" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" />
      <AdminWorkspace surfaceClassName="bg-white">
        <ProgramFinancesData slug={slug} programId={programId} mode="admin" />
      </AdminWorkspace>
    </>
  );
}

export function AdminProgramApplicationsPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Applications" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" />
      <AdminWorkspace surfaceClassName="bg-white">
        <ProgramApplicationsData slug={slug} programId={programId} mode="admin" />
      </AdminWorkspace>
    </>
  );
}

export function AdminMasjidFinancesPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="Finances" backHref={`/m/${slug}/admin/masjid`} backLabel="Masjid" tone="teal" />
      <AdminWorkspace surfaceClassName="bg-white">
        <AdminMasjidFinancesData slug={slug} />
      </AdminWorkspace>
    </>
  );
}

export function AdminSettingsPage({ slug }: { slug: string }) {
  return <PortalAccountData slug={slug} />;
}
