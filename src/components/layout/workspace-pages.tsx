"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { AdminProgramStudentsPage, AdminDashboardPage, AdminProgramsPage, AdminMasjidPage, AdminSettingsPage, AdminProgramDetailPage, AdminProgramCreatePage, AdminProgramApplicationsPage, AdminProgramFinancesPage } from "@/components/pages/admin-pages";
import { TeacherStudentsPage, TeacherDashboardPage, TeacherClassesPage, TeacherInboxPage, TeacherAccountPage, TeacherProgramDetailPage, TeacherProgramCreatePage, TeacherProgramApplicationsPage, TeacherProgramFinancesPage } from "@/components/pages/teacher-pages";
import { PortalDashboardPage, PortalClassesPage, PortalAnnouncementsPage, PortalAccountPage, PublicAccountPage } from "@/components/pages/portal-pages";
import { PublicMasjidPage, PublicProgramsPage } from "@/components/pages/public-pages";
import { useWorkspacePathname } from "@/components/layout/workspace-navigation";
import { workspaceRoute, type WorkspaceSection } from "@/lib/navigation-paths";

export function WorkspacePages({ slug, section, children }: { slug: string; section: WorkspaceSection; children: React.ReactNode }) {
  const pathname = useWorkspacePathname();
  const searchParams = useSearchParams();
  const route = workspaceRoute(pathname, slug, section);
  const [primaryPages, setPrimaryPages] = useState<Map<string, React.ReactNode>>(() => new Map());
  if (!route) return <div data-workspace-page={pathname}>{children}</div>;
  const [screen, programId] = route.split(":");
  let page: React.ReactNode = children;
  if (section === "admin") {
    if (screen === "home") page = <AdminDashboardPage slug={slug} />;
    if (screen === "classes") page = <AdminProgramsPage slug={slug} />;
    if (screen === "masjid") page = <AdminMasjidPage slug={slug} />;
    if (screen === "account") page = <AdminSettingsPage slug={slug} />;
    if (screen === "edit") page = <AdminProgramDetailPage slug={slug} programId={programId} />;
    if (screen === "create") page = <AdminProgramCreatePage slug={slug} />;
    if (screen === "applications") page = <AdminProgramApplicationsPage slug={slug} programId={programId} />;
    if (screen === "students") page = <AdminProgramStudentsPage slug={slug} programId={programId} />;
    if (screen === "finances") page = <AdminProgramFinancesPage slug={slug} programId={programId} />;
  } else if (section === "teacher") {
    if (screen === "home") page = <TeacherDashboardPage slug={slug} />;
    if (screen === "classes") page = <TeacherClassesPage slug={slug} />;
    if (screen === "inbox") page = <TeacherInboxPage slug={slug} />;
    if (screen === "account") page = <TeacherAccountPage slug={slug} />;
    if (screen === "edit") page = <TeacherProgramDetailPage slug={slug} programId={programId} />;
    if (screen === "create") page = <TeacherProgramCreatePage slug={slug} />;
    if (screen === "applications") page = <TeacherProgramApplicationsPage slug={slug} programId={programId} />;
    if (screen === "students") page = <TeacherStudentsPage slug={slug} programId={programId} fromHome={searchParams.get("from") === "home"} />;
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

  // Keep only the small primary destinations mounted after their first visit. This
  // preserves their rendered lists, local filters and scrollable content so returning
  // to a tab is a synchronous reveal. Operational screens remain single-use and unmount
  // normally; retaining builders or large student/finance files would waste memory.
  const primaryScreens = new Set(["home", "classes", "inbox", "account", "masjid"]);
  let renderedPrimaryPages = primaryPages;
  if (primaryScreens.has(screen) && !primaryPages.has(screen)) {
    renderedPrimaryPages = new Map(primaryPages);
    renderedPrimaryPages.set(screen, page);
    setPrimaryPages(renderedPrimaryPages);
  }

  return (
    <div data-workspace-page={pathname}>
      {Array.from(renderedPrimaryPages.entries()).map(([cachedScreen, cachedPage]) => (
        <div key={cachedScreen} hidden={cachedScreen !== screen} aria-hidden={cachedScreen !== screen || undefined}>
          {cachedPage}
        </div>
      ))}
      {!primaryScreens.has(screen) ? <div key={pathname}>{page}</div> : null}
    </div>
  );
}
