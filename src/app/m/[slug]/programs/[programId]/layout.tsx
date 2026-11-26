import { ProgramPreviewShell } from "@/components/auth/program-preview-shell";
import { loadTenantBrandingBySlug } from "@/lib/tenant-branding";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const branding = await loadTenantBrandingBySlug(slug);
  return <ProgramPreviewShell slug={slug} mosqueName={branding.chromeName} mosqueLogoUrl={branding.iconUrl}>{children}</ProgramPreviewShell>;
}
