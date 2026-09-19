export type WorkspaceSection = "public" | "portal" | "teacher" | "admin";

export function workspacePath(pathname: string, slug: string) {
  if (pathname === "/m" || pathname.startsWith("/m/")) return pathname;
  return `/m/${slug}${pathname === "/" ? "" : pathname}`;
}

export function browserHref(href: string, slug: string, hostname: string) {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "madrasa.ca";
  if (hostname !== `${slug}.${root}` && hostname !== `${slug}.localhost`) return href;
  const prefix = `/m/${slug}`;
  if (href === prefix) return "/";
  if (href.startsWith(`${prefix}/`)) return href.slice(prefix.length);
  if (href.startsWith(`${prefix}?`) || href.startsWith(`${prefix}#`)) return `/${href.slice(prefix.length)}`;
  return href;
}

export function workspaceRoute(pathname: string, slug: string, section: WorkspaceSection): string | null {
  const path = workspacePath(pathname, slug);
  const base = `/m/${slug}${section === "public" ? "" : `/${section}`}`;
  if (path === base || path === `${base}/`) return "home";
  const suffix = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : null;
  const classes = section === "admin" || section === "public" ? "programs" : "classes";
  if (suffix === classes) return "classes";
  if (suffix === (section === "admin" ? "settings" : "account")) return "account";
  if (section === "admin" && suffix === "masjid") return "masjid";
  if (section === "teacher" && suffix === "inbox") return "inbox";
  if (section === "portal" && suffix === "announcements") return "inbox";
  if (section === "teacher" || section === "admin") {
    if (suffix === `${classes}/new`) return "create";
    const match = suffix?.match(new RegExp(`^${classes}/([a-f0-9-]{36})(?:/(applications|finances))?$`, "i"));
    if (match) return `${match[2] ?? "edit"}:${match[1]}`;
  }
  return null;
}
