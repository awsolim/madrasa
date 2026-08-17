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
  iconUrl: string;
  appleIconUrl: string;
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
  if (!slug) {
    return { slug: null, ...DEFAULT_BRANDING };
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("mosques")
      .select("name, slug, logo_url, pwa_name, pwa_short_name, app_icon_url")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) {
      return { slug, ...DEFAULT_BRANDING };
    }

    const name = data.pwa_name?.trim() || data.name?.trim() || titleFromSlug(data.slug || slug) || DEFAULT_BRANDING.name;
    const shortName = data.pwa_short_name?.trim() || name;
    const iconUrl = data.app_icon_url?.trim() || data.logo_url?.trim() || DEFAULT_BRANDING.iconUrl;

    return {
      slug,
      name,
      shortName: shortName.slice(0, 24),
      iconUrl,
      appleIconUrl: iconUrl || DEFAULT_BRANDING.appleIconUrl,
    };
  } catch {
    return { slug, ...DEFAULT_BRANDING };
  }
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
