"use client";

import { ProgramAttendanceHistoryData, ProgramAttendanceMarkData } from "@/components/data/program-attendance";
import { PageTitleBar } from "@/components/layout/page-title-bar";
import { cn } from "@/lib/utils";

function AttendanceWorkspace({
  children,
  overlapOffset = "-172px",
  surfaceClassName = "bg-white",
}: {
  children: React.ReactNode;
  overlapOffset?: string;
  surfaceClassName?: string;
}) {
  return (
    <div className="relative z-10 min-h-[calc(100vh-260px)]" style={{ marginTop: overlapOffset }}>
      <div className={cn("min-h-[calc(100vh-260px)] overflow-hidden rounded-t-[34px]", surfaceClassName)}>{children}</div>
    </div>
  );
}

export function TeacherProgramAttendancePage({ slug, programId, returnTo, from }: { slug: string; programId: string; returnTo?: string; from?: string }) {
  const backHref = returnTo ?? (from === "mark" ? `/m/${slug}/teacher/classes/${programId}/attendance/mark` : `/m/${slug}/teacher/classes`);
  const backLabel = from === "mark" ? "Mark Attendance" : "Classes";
  return (
    <>
      <PageTitleBar title="Attendance History" backHref={backHref} backLabel={backLabel} tone="teal" />
      <AttendanceWorkspace>
        <ProgramAttendanceHistoryData slug={slug} programId={programId} mode="teacher" />
      </AttendanceWorkspace>
    </>
  );
}

export function TeacherProgramMarkAttendancePage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Mark Attendance" backHref={`/m/${slug}/teacher`} backLabel="Home" tone="teal" />
      <AttendanceWorkspace>
        <ProgramAttendanceMarkData slug={slug} programId={programId} />
      </AttendanceWorkspace>
    </>
  );
}

export function AdminProgramAttendancePage({ slug, programId }: { slug: string; programId: string }) {
  return (
    <>
      <PageTitleBar title="Attendance History" backHref={`/m/${slug}/admin/programs`} backLabel="Classes" tone="teal" />
      <AttendanceWorkspace>
        <ProgramAttendanceHistoryData slug={slug} programId={programId} mode="admin" />
      </AttendanceWorkspace>
    </>
  );
}
