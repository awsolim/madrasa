"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { getCachedMosqueChrome } from "@/lib/client-cache";
import { TenantBootState } from "@/components/auth/tenant-startup-state";

const subscribe = () => () => {};
const serverSnapshot = () => null;

export function TenantRouteLoading() {
  const { slug } = useParams<{ slug: string }>();
  const branding = useSyncExternalStore(subscribe, () => getCachedMosqueChrome(slug), serverSnapshot);
  const fallbackName = slug.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return <TenantBootState mosqueName={(branding?.name && branding.name.toLowerCase() !== "madrasa" ? branding.name : fallbackName)} mosqueLogoUrl={branding?.logoUrl || "/tenant-icon.svg"} />;
}
