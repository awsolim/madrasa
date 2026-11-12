import "server-only";

import { directoryMasjids, type PublicMasjid } from "@/lib/masjid-directory";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function loadPublicMasjids() {
  const { url, anonKey } = getSupabasePublicEnv();
  const endpoint = new URL("/rest/v1/mosques", url);
  endpoint.searchParams.set("select", "name,slug,logo_url,address");
  endpoint.searchParams.set("order", "name.asc");
  const response = await fetch(endpoint, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Could not load the public masjid directory.");
  return directoryMasjids(await response.json() as PublicMasjid[]);
}
