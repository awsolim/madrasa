import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadTenantBrandingBySlug, tenantSlugFromHost } from "@/lib/tenant-branding";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const hostTenantSlug = tenantSlugFromHost(host);
  const branding = await loadTenantBrandingBySlug(slug);
  const tenantIconUrl = `/api/pwa/icon?tenant=${encodeURIComponent(slug)}&size=180&purpose=apple`;

  return {
    applicationName: branding.name,
    title: {
      default: branding.name,
      template: `%s | ${branding.name}`,
    },
    manifest: hostTenantSlug === slug ? "/manifest.webmanifest" : `/m/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.shortName,
    },
    icons: {
      apple: [{ url: tenantIconUrl, sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
