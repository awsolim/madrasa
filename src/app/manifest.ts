import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { loadTenantBrandingFromHost } from "@/lib/tenant-branding";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);
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
        src: `${iconSrc}?size=16`,
        sizes: "16x16",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=32`,
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=72`,
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=96`,
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=128`,
        sizes: "128x128",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=144`,
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=192`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=384`,
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${iconSrc}?size=192&purpose=maskable`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${iconSrc}?size=512&purpose=maskable`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

