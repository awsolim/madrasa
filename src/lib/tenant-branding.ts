import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

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

export function tenantSlugFromHost(hostname: string) {
  const rootDomain = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || DEFAULT_ROOT_DOMAIN).toLowerCase();
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";

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

export async function loadTenantBrandingBySlug(slug: string): Promise<TenantBranding> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("mosques")
      .select("name, slug, short_name, logo_url, picture_url, pwa_name, app_icon_url")
      .eq("slug", slug)
      .maybeSingle<MosqueBrandingRow>();

    if (!data) {
      return { slug, chromeName: titleFromSlug(slug) || DEFAULT_BRANDING.name, ...DEFAULT_BRANDING };
    }

    return tenantBrandingFromMosque(data, slug);
  } catch {
    return { slug, chromeName: titleFromSlug(slug) || DEFAULT_BRANDING.name, ...DEFAULT_BRANDING };
  }
}

function tenantBrandingFromMosque(data: MosqueBrandingRow, fallbackSlug: string): TenantBranding {
  const fallbackName = data.name?.trim() || titleFromSlug(data.slug || fallbackSlug) || DEFAULT_BRANDING.name;
  const chromeName = data.short_name?.trim() || fallbackName;
  const name = data.pwa_name?.trim() || fallbackName;
  const shortName = chromeName.slice(0, 24);
  const iconUrl = data.app_icon_url?.trim() || data.logo_url?.trim() || data.picture_url?.trim() || DEFAULT_BRANDING.iconUrl;

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

