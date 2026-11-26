import { PublicAreaGate } from "@/components/auth/public-area-gate";
import { loadTenantBrandingBySlug } from "@/lib/tenant-branding";
import { Suspense } from "react";
import { TenantRouteLoading } from "@/components/auth/tenant-route-loading";

// Mirrors portal/layout.tsx, teacher/layout.tsx, admin/layout.tsx: one persistent chrome
// instance for the whole route family, so navigating between the mosque home, programs
// browse, a program's detail page, and account no longer remounts the top bar/bottom nav/
// sidebar on every hop. This is a route group (no URL segment) — /m/[slug]/programs still
// resolves exactly as before. The gate resolves the account before routing signed-in
// users to their portal. Confirmed guests browse classes using the same chrome.
export default function Layout(props: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<TenantRouteLoading />}><BrandedPublicLayout {...props} /></Suspense>;
}

async function BrandedPublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const branding = await loadTenantBrandingBySlug(slug);
  return (
    <PublicAreaGate slug={slug} mosqueName={branding.chromeName} mosqueLogoUrl={branding.iconUrl}>
      {children}
    </PublicAreaGate>
  );
}
