import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadTenantBrandingBySlug, tenantSlugFromHost } from "@/lib/tenant-branding";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const hostTenantSlug = tenantSlugFromHost(host);
  const branding = await loadTenantBrandingBySlug(slug);
  const tenantIcon = `/api/pwa/icon?tenant=${encodeURIComponent(slug)}`;

  return {
    applicationName: branding.name,
    title: {
      absolute: branding.name,
    },
    manifest: hostTenantSlug === slug ? "/manifest.webmanifest" : `/m/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.shortName,
    },
    icons: {
      icon: [
        { url: `${tenantIcon}&size=32`, sizes: "32x32", type: "image/png" },
        { url: `${tenantIcon}&size=192`, sizes: "192x192", type: "image/png" },
        { url: `${tenantIcon}&size=512`, sizes: "512x512", type: "image/png" },
      ],
      shortcut: [{ url: `${tenantIcon}&size=32` }],
      apple: [{ url: `${tenantIcon}&size=180&purpose=apple`, sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return children;
}

