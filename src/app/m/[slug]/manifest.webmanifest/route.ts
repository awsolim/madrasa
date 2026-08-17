import { NextRequest, NextResponse } from "next/server";
import { loadTenantBrandingBySlug, tenantSlugFromHost } from "@/lib/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function manifestPayload({ name, shortName, startUrl, slug }: { name: string; shortName: string; startUrl: string; slug: string }) {
  const iconSrc = `/api/pwa/icon?tenant=${encodeURIComponent(slug)}`;
  return {
    name,
    short_name: shortName,
    description: "Masjid class registration and management portal",
    start_url: startUrl,
    scope: startUrl === "/" ? "/" : `${startUrl}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#E8F3F0",
    theme_color: "#6FB7B2",
    categories: ["education", "productivity"],
    icons: [
      { src: `${iconSrc}&size=16`, sizes: "16x16", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=32`, sizes: "32x32", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=72`, sizes: "72x72", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=96`, sizes: "96x96", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=128`, sizes: "128x128", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=144`, sizes: "144x144", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=384`, sizes: "384x384", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${iconSrc}&size=192&purpose=maskable`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${iconSrc}&size=512&purpose=maskable`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const hostTenantSlug = tenantSlugFromHost(host);
  const branding = await loadTenantBrandingBySlug(slug);
  const startUrl = hostTenantSlug === slug ? "/" : `/m/${slug}`;

  return NextResponse.json(manifestPayload({ name: branding.name, shortName: branding.shortName, startUrl, slug }), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
