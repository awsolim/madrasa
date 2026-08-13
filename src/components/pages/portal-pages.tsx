"use client";

import { ChildrenManager } from "@/components/data/children-manager";
import { PortalRoleRedirect } from "@/components/data/portal-role-redirect";
import { PortalAccountData, ProgramDetailData, RegistrationConfirmationData, StudentClassesData, StudentHomeData, StudentScheduleOptionsData, StudentWithdrawalRequestData } from "@/components/data/supabase-public-sections";
import { InboxAnnouncementsData } from "@/components/data/student-inbox";
import { PageShell } from "@/components/layout/page-shell";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { FlatButton } from "@/components/ui/flat-button";
import { cn } from "@/lib/utils";

function PortalWorkspace({
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

function PortalPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`bg-white ${className}`}>{children}</section>;
}

function PortalSectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between border-b border-[#D6DCE0] bg-white px-4">
      <h2 className="text-base font-medium text-[#26323A]">{title}</h2>
      {action}
    </div>
  );
}

export function PublicAccountPage({ slug }: { slug: string }) {
  return <PortalAccountData slug={slug} />;
}

export function RegistrationConfirmationPage({ requestId, slug, returnTo }: { requestId: string; slug: string; returnTo?: string }) {
  return (
    <PageShell slug={slug}>
      <PageTitleBar title="Complete Registration" closeHref={returnTo ?? `/m/${slug}/portal/classes`} closeLabel="Close" tone="teal" />
      <PortalWorkspace>
        <RegistrationConfirmationData slug={slug} requestId={requestId} />
      </PortalWorkspace>
    </PageShell>
  );
}

export function PortalProgramDetailPage({ programId, slug }: { programId: string; slug: string }) {
  return (
    <>
      <PageTitleBar title="Class Details" backHref={`/m/${slug}/portal/classes`} backLabel="Classes" tone="teal" />
      <PortalWorkspace>
        <ProgramDetailData slug={slug} programId={programId} section="portal" />
      </PortalWorkspace>
    </>
  );
}

export function PortalDashboardPage({ slug }: { slug: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher`} adminHref={`/m/${slug}/admin`}>
      <PageTitleBar title="Home" />
      <PortalWorkspace>
        <StudentHomeData slug={slug} />
      </PortalWorkspace>
    </PortalRoleRedirect>
  );
}

export function PortalAccountPage({ slug }: { slug: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher/account`} adminHref={`/m/${slug}/admin/settings`}>
      <PortalAccountData slug={slug} />
    </PortalRoleRedirect>
  );
}

export function PortalFamilyPage({ slug }: { slug: string }) {
  return (
    <>
      <PageTitleBar title="My Family" subtitle="Students connected to this family account." />
      <PortalWorkspace>
        <PortalPanel>
          <ChildrenManager slug={slug} />
        </PortalPanel>
      </PortalWorkspace>
    </>
  );
}

export function PortalClassesPage({ slug }: { slug: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher/classes`} adminHref={`/m/${slug}/admin/programs`}>
      <PageTitleBar title="Classes" tone="teal" />
      <PortalWorkspace>
        <StudentClassesData slug={slug} />
      </PortalWorkspace>
    </PortalRoleRedirect>
  );
}

export function PortalScheduleOptionsPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher/classes`} adminHref={`/m/${slug}/admin/programs`}>
      <PageTitleBar title="Schedule Options" backHref={`/m/${slug}/portal/classes`} backLabel="Classes" tone="teal" />
      <PortalWorkspace surfaceClassName="bg-white">
        <StudentScheduleOptionsData slug={slug} programId={programId} />
      </PortalWorkspace>
    </PortalRoleRedirect>
  );
}

export function PortalWithdrawalRequestPage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher/classes`} adminHref={`/m/${slug}/admin/programs`}>
      <PageTitleBar title="Withdrawal" backHref={`/m/${slug}/portal/classes`} backLabel="Classes" tone="teal" />
      <PortalWorkspace surfaceClassName="bg-white">
        <StudentWithdrawalRequestData slug={slug} programId={programId} />
      </PortalWorkspace>
    </PortalRoleRedirect>
  );
}

function EmptyAttendanceState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#22A6B3] text-3xl font-medium text-[#22A6B3]">!</div>
      <h3 className="mt-4 text-base font-medium text-[#26323A]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[#6B747B]">{text}</p>
    </div>
  );
}

export function PortalAttendancePage({ slug }: { slug: string }) {
  void slug;
  return (
    <>
      <PageTitleBar title="Attendance" subtitle="Review attendance and submit planned absences." tone="teal" />
      <PortalWorkspace>
        <PortalPanel className="border-b border-[#D6DCE0] p-4">
          <p className="text-sm leading-6 text-[#26323A]">Use this area to review recent attendance and notify the office before a student misses class.</p>
          <div className="mt-4">
            <FlatButton variant="success">Submit an Absence</FlatButton>
          </div>
        </PortalPanel>
        <PortalPanel>
          <PortalSectionHeader title="Upcoming" />
          <EmptyAttendanceState title="No upcoming absences" text="Submitted absences for upcoming classes will appear here." />
        </PortalPanel>
        <PortalPanel>
          <PortalSectionHeader title="Past" />
          <EmptyAttendanceState title="No attendance records" text="Past attendance records will appear here after class." />
        </PortalPanel>
      </PortalWorkspace>
    </>
  );
}

export function PortalAnnouncementsPage({ slug }: { slug: string }) {
  return (
    <PortalRoleRedirect slug={slug} teacherHref={`/m/${slug}/teacher/inbox`} adminHref={`/m/${slug}/admin`}>
      <PageTitleBar title="Inbox" />
      <PortalWorkspace>
        <PortalPanel>
          <InboxAnnouncementsData slug={slug} />
        </PortalPanel>
      </PortalWorkspace>
    </PortalRoleRedirect>
  );
}
