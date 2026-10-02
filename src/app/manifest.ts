import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { iconCacheVersion, loadTenantBrandingFromHost } from "@/lib/tenant-branding";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);
  const v = iconCacheVersion(branding.iconUrl);
  const iconSrc = "/api/pwa/icon";

  return {
    name: branding.name,
    short_name: branding.shortName,
    description: "Masjid class registration and management portal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#E8F3F0",
    theme_color: "#6FB7B2",
    categories: ["education", "productivity"],
    icons: [
      {
        src: `${iconSrc}?size=16&v=${v}`,
        sizes: "16x16",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=32&v=${v}`,
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=72&v=${v}`,
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=96&v=${v}`,
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=128&v=${v}`,
        sizes: "128x128",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=144&v=${v}`,
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=192&v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=384&v=${v}`,
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=512&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=192&purpose=maskable&v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${iconSrc}?size=512&purpose=maskable&v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

