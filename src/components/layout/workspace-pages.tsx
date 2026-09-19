"use client";

import { AdminDashboardPage, AdminProgramsPage, AdminMasjidPage, AdminSettingsPage, AdminProgramDetailPage, AdminProgramCreatePage, AdminProgramApplicationsPage, AdminProgramFinancesPage } from "@/components/pages/admin-pages";
import { TeacherDashboardPage, TeacherClassesPage, TeacherInboxPage, TeacherAccountPage, TeacherProgramDetailPage, TeacherProgramCreatePage, TeacherProgramApplicationsPage, TeacherProgramFinancesPage } from "@/components/pages/teacher-pages";
import { PortalDashboardPage, PortalClassesPage, PortalAnnouncementsPage, PortalAccountPage, PublicAccountPage } from "@/components/pages/portal-pages";
import { PublicMasjidPage, PublicProgramsPage } from "@/components/pages/public-pages";
import { useWorkspacePathname } from "@/components/layout/workspace-navigation";
import { workspaceRoute, type WorkspaceSection } from "@/lib/navigation-paths";

export function WorkspacePages({ slug, section, children }: { slug: string; section: WorkspaceSection; children: React.ReactNode }) {
  const pathname = useWorkspacePathname();
  const route = workspaceRoute(pathname, slug, section);
  const [screen, programId] = route?.split(":") ?? [];
  let page: React.ReactNode = children;
  if (section === "admin") {
    if (screen === "home") page = <AdminDashboardPage slug={slug} />;
    if (screen === "classes") page = <AdminProgramsPage slug={slug} />;
    if (screen === "masjid") page = <AdminMasjidPage slug={slug} />;
    if (screen === "account") page = <AdminSettingsPage slug={slug} />;
    if (screen === "edit") page = <AdminProgramDetailPage slug={slug} programId={programId} />;
    if (screen === "create") page = <AdminProgramCreatePage slug={slug} />;
    if (screen === "applications") page = <AdminProgramApplicationsPage slug={slug} programId={programId} />;
    if (screen === "finances") page = <AdminProgramFinancesPage slug={slug} programId={programId} />;
  } else if (section === "teacher") {
    if (screen === "home") page = <TeacherDashboardPage slug={slug} />;
    if (screen === "classes") page = <TeacherClassesPage slug={slug} />;
    if (screen === "inbox") page = <TeacherInboxPage slug={slug} />;
    if (screen === "account") page = <TeacherAccountPage slug={slug} />;
    if (screen === "edit") page = <TeacherProgramDetailPage slug={slug} programId={programId} />;
    if (screen === "create") page = <TeacherProgramCreatePage slug={slug} />;
    if (screen === "applications") page = <TeacherProgramApplicationsPage slug={slug} programId={programId} />;
    if (screen === "finances") page = <TeacherProgramFinancesPage slug={slug} programId={programId} />;
  } else if (section === "portal") {
    if (screen === "home") page = <PortalDashboardPage slug={slug} />;
    if (screen === "classes") page = <PortalClassesPage slug={slug} />;
    if (screen === "inbox") page = <PortalAnnouncementsPage slug={slug} />;
    if (screen === "account") page = <PortalAccountPage slug={slug} />;
  } else {
    if (screen === "home") page = <PublicMasjidPage slug={slug} />;
    if (screen === "classes") page = <PublicProgramsPage slug={slug} />;
    if (screen === "account") page = <PublicAccountPage slug={slug} />;
  }
  return <div key={pathname} data-workspace-page={pathname}>{page}</div>;
}
