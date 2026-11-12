export type PublicMasjid = {
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
};

export function masjidHomepage(slug: string, hostname: string, rootDomain: string) {
  // Local and deployment previews use the existing tenant routes. Production
  // opens the tenant's own origin, where its login and installed app belong.
  if (hostname !== rootDomain && hostname !== `www.${rootDomain}`) return `/m/${slug}`;
  return `https://${slug}.${rootDomain}/`;
}

export function directoryMasjids(rows: PublicMasjid[]) {
  return rows
    .filter((row) => row.name?.trim() && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(row.slug) && row.slug !== "www")
    .sort((left, right) => left.name.localeCompare(right.name));
}
