import { PublicAreaGate } from "@/components/auth/public-area-gate";
import { loadTenantBrandingBySlug } from "@/lib/tenant-branding";

// Mirrors portal/layout.tsx, teacher/layout.tsx, admin/layout.tsx: one persistent chrome
// instance for the whole route family, so navigating between the mosque home, programs
// browse, a program's detail page, and account no longer remounts the top bar/bottom nav/
// sidebar on every hop. This is a route group (no URL segment) — /m/[slug]/programs still
// resolves exactly as before. PublicAreaGate additionally requires a session before any of
// this route family renders — there is no guest/browse-only mode.
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const branding = await loadTenantBrandingBySlug(slug);
  return (
    <PublicAreaGate slug={slug} mosqueName={branding.name} mosqueLogoUrl={branding.iconUrl}>
      {children}
    </PublicAreaGate>
  );
}
