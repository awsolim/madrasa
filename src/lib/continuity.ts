import tenants from "../../data/class-directory/tenants.json";

export function classDirectoryHref(slug: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && tenants.includes(slug)
    ? `/continuity/${slug}.html`
    : null;
}

export function maintenanceDirectoryHref(slug: string, configured: string | undefined): string | null {
  return configured?.split(",").map(value => value.trim()).includes(slug) ? classDirectoryHref(slug) : null;
}
