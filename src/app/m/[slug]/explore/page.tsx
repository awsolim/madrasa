import { GuestProgramsPage } from "@/components/pages/public-pages";
import { loadTenantBrandingBySlug } from "@/lib/tenant-branding";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const branding = await loadTenantBrandingBySlug(slug);

  return <GuestProgramsPage slug={slug} mosqueName={branding.name} mosqueLogoUrl={branding.iconUrl} />;
}
