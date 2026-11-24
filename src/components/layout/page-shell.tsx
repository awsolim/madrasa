import { AppTopBar, MobileBottomNav } from "@/components/layout/app-top-bar";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { NavItem } from "@/components/layout/horizontal-nav";
import { PageTransitionFrame } from "@/components/layout/page-transition-frame";
import { PrimaryNavPrefetch } from "@/components/layout/primary-nav-prefetch";
import { WorkspaceNavigationProvider } from "@/components/layout/workspace-navigation";
import { WorkspacePages } from "@/components/layout/workspace-pages";
import { NavigationDiagnostics } from "@/components/monitoring/navigation-diagnostics";
import { MasjidActivityTracker } from "@/components/monitoring/masjid-activity-tracker";
import { PushNotificationManager } from "@/components/pwa/push-notification-manager";

import { workspaceNavItems } from "@/lib/navigation-paths";

const defaultAppName = "Madrasa";

export function AppChrome({
  children,
  section = "public",
  navItems,
  mobileNavItems,
  slug,
}: {
  children: React.ReactNode;
  section?: "public" | "portal" | "teacher" | "admin";
  navItems?: NavItem[];
  mobileNavItems?: NavItem[];
  slug: string;
}) {
  const defaultNav = workspaceNavItems(slug, section);
  const resolvedNav = navItems ?? defaultNav;
  const resolvedMobileNav = mobileNavItems ?? resolvedNav;
  const notificationSettingsHref = section === "admin"
    ? `/m/${slug}/admin/settings`
    : section === "teacher"
      ? `/m/${slug}/teacher/account`
      : `/m/${slug}/portal/account`;
  return (
    <WorkspaceNavigationProvider slug={slug} section={section}>
      <PrimaryNavPrefetch slug={slug} section={section} />
      <NavigationDiagnostics />
      <MasjidActivityTracker slug={slug} />
      {section !== "public" ? <PushNotificationManager settingsHref={notificationSettingsHref} /> : null}
      <AppTopBar appName={defaultAppName} mosqueSlug={slug} homeHref={resolvedNav[0]?.href ?? `/m/${slug}/programs`} navItems={resolvedNav} mobileNavItems={resolvedMobileNav} />
      <MobileBottomNav mosqueSlug={slug} navItems={resolvedNav} mobileNavItems={resolvedMobileNav} />
      <DesktopSidebar appName={defaultAppName} mosqueSlug={slug} homeHref={resolvedNav[0]?.href ?? `/m/${slug}/programs`} navItems={resolvedNav} mobileNavItems={resolvedMobileNav} section={section} />
      <div className="md:min-h-screen md:bg-[var(--workspace)] md:pl-72">
        <div className="md:min-h-screen md:overflow-hidden md:bg-transparent">
          <PageTransitionFrame><WorkspacePages slug={slug} section={section}>{children}</WorkspacePages></PageTransitionFrame>
        </div>
      </div>
    </WorkspaceNavigationProvider>
  );
}

export function PageShell(props: {
  children: React.ReactNode;
  section?: "public" | "portal" | "teacher" | "admin";
  navItems?: NavItem[];
  mobileNavItems?: NavItem[];
  slug: string;
}) {
  return <AppChrome {...props} />;
}
