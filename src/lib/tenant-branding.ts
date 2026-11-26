import "server-only";

import { cache } from "react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const DEFAULT_ROOT_DOMAIN = "madrasa.ca";
const DEFAULT_BRANDING = {
  name: "Madrasa",
  shortName: "Madrasa",
  iconUrl: "/icon-512x512.png",
  appleIconUrl: "/apple-touch-icon.png",
};

export type TenantBranding = {
  slug: string | null;
  name: string;
  shortName: string;
  chromeName: string;
  iconUrl: string;
  appleIconUrl: string;
};

type MosqueBrandingRow = {
  name: string | null;
  slug: string | null;
  short_name: string | null;
  logo_url: string | null;
  picture_url: string | null;
  pwa_name: string | null;
  app_icon_url: string | null;
};

// Public identity only. Never cache a session or an authorization decision here.
const lastKnownBranding = new Map<string, TenantBranding>();

export function tenantSlugFromHost(hostname: string) {
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || DEFAULT_ROOT_DOMAIN).toLowerCase();
  const host = hostname.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";

  if (!host || host === rootDomain || host === `www.${rootDomain}`) {
    return null;
  }

  if (host.endsWith(`.${rootDomain}`)) {
    const subdomain = host.slice(0, -(`.${rootDomain}`.length));
    return subdomain && subdomain !== "www" ? subdomain : null;
  }

  if (host.endsWith(".localhost")) {
    const subdomain = host.slice(0, -(".localhost".length));
    return subdomain && subdomain !== "www" ? subdomain : null;
  }

  return null;
}

export async function loadTenantBrandingFromHost(hostname: string): Promise<TenantBranding> {
  const slug = tenantSlugFromHost(hostname);
  return slug ? loadTenantBrandingBySlug(slug) : { slug: null, chromeName: DEFAULT_BRANDING.name, ...DEFAULT_BRANDING };
}

export const loadTenantBrandingBySlug = cache(async (slug: string): Promise<TenantBranding> => {
  try {
    const { url, anonKey } = getSupabasePublicEnv();
    const endpoint = new URL("/rest/v1/mosques", url);
    endpoint.searchParams.set("select", "name,slug,short_name,logo_url,picture_url,pwa_name,app_icon_url");
    endpoint.searchParams.set("slug", `eq.${slug}`);
    endpoint.searchParams.set("limit", "1");
    // Branding must not hold startup behind repeated 15-second database retries.
    // Next's data cache serves recent identity across requests; React cache also
    // shares the lookup between layouts and metadata in the same render.
    const response = await fetch(endpoint, {
      headers: { apikey: anonKey },
      next: { revalidate: 300, tags: [`tenant-branding:${slug}`] },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error("Tenant branding unavailable.");
    const rows = await response.json() as MosqueBrandingRow[];
    if (!rows[0]) return fallbackTenantBranding(slug);
    const branding = tenantBrandingFromMosque(rows[0], slug);
    lastKnownBranding.set(slug, branding);
    if (lastKnownBranding.size > 100) lastKnownBranding.delete(lastKnownBranding.keys().next().value as string);
    return branding;
  } catch {
    return lastKnownBranding.get(slug) ?? fallbackTenantBranding(slug);
  }
});

function fallbackTenantBranding(slug: string): TenantBranding {
  const name = titleFromSlug(slug) || "Your masjid";
  return { slug, name, shortName: name.slice(0, 24), chromeName: name, iconUrl: "/tenant-icon.svg", appleIconUrl: "/tenant-icon.svg" };
}

function tenantBrandingFromMosque(data: MosqueBrandingRow, fallbackSlug: string): TenantBranding {
  const fallbackName = data.name?.trim() || titleFromSlug(data.slug || fallbackSlug) || DEFAULT_BRANDING.name;
  const chromeName = data.short_name?.trim() || fallbackName;
  const name = data.pwa_name?.trim() || fallbackName;
  const shortName = chromeName.slice(0, 24);
  const iconUrl = data.app_icon_url?.trim() || data.logo_url?.trim() || data.picture_url?.trim() || "/tenant-icon.svg";

  return {
    slug: data.slug || fallbackSlug,
    name,
    shortName,
    chromeName,
    iconUrl,
    appleIconUrl: iconUrl || DEFAULT_BRANDING.appleIconUrl,
  };
}

export function iconCacheVersion(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

