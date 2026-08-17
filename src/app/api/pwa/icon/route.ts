import { NextRequest, NextResponse } from "next/server";
import { loadTenantBrandingBySlug, loadTenantBrandingFromHost } from "@/lib/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BY_SIZE: Record<string, string> = {
  "16": "/favicon-16x16.png",
  "32": "/favicon-32x32.png",
  "48": "/favicon-48x48.png",
  "72": "/icon-72x72.png",
  "96": "/icon-96x96.png",
  "128": "/icon-128x128.png",
  "144": "/icon-144x144.png",
  "180": "/apple-touch-icon.png",
  "192": "/icon-192x192.png",
  "384": "/icon-384x384.png",
  "512": "/icon-512x512.png",
};

function sameOriginUrl(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return url;
}

function fallbackResponse(request: NextRequest, size: string) {
  return NextResponse.redirect(sameOriginUrl(request, DEFAULT_BY_SIZE[size] ?? "/icon-512x512.png"), 307);
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const size = request.nextUrl.searchParams.get("size") || "512";
  const explicitTenant = request.nextUrl.searchParams.get("tenant");
  const branding = explicitTenant ? await loadTenantBrandingBySlug(explicitTenant) : await loadTenantBrandingFromHost(host);
  const fallbackPath = DEFAULT_BY_SIZE[size] ?? "/icon-512x512.png";
  const iconUrl = branding.iconUrl || fallbackPath;

  if (iconUrl.startsWith("http://") || iconUrl.startsWith("https://")) {
    try {
      const iconResponse = await fetch(iconUrl, { cache: "no-store" });
      if (!iconResponse.ok || !iconResponse.body) {
        return fallbackResponse(request, size);
      }
      return new NextResponse(iconResponse.body, {
        headers: {
          "content-type": iconResponse.headers.get("content-type") || "image/png",
          "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    } catch {
      return fallbackResponse(request, size);
    }
  }

  return NextResponse.redirect(sameOriginUrl(request, iconUrl.startsWith("/") ? iconUrl : fallbackPath), 307);
}
