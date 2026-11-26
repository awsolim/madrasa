import { getDefaultLandingHref, type UserAccess } from "@/lib/authz";
import { workspacePath } from "@/lib/navigation-paths";

export function publicPrimaryTab(pathname: string, slug: string): "classes" | "schedule" | "account" | "inbox" | null {
  const base = `/m/${slug}`;
  const path = workspacePath(pathname, slug).replace(/\/$/, "");
  if ([base, `${base}/programs`, `${base}/explore`].includes(path)) return "classes";
  if (path === `${base}/schedule`) return "schedule";
  if (path === `${base}/account`) return "account";
  if (path === `${base}/inbox`) return "inbox";
  return null;
}

export function publicAccountDestination(pathname: string, slug: string, access: UserAccess, search = ""): string | null {
  const base = `/m/${slug}`;
  const tab = publicPrimaryTab(pathname, slug);
  if (tab === "classes") return getDefaultLandingHref(slug, access);
  const role = access.isMosqueAdmin ? "admin" : access.isTeacher ? "teacher" : "portal";
  const query = search ? `?${new URLSearchParams(search)}` : "";
  if (tab === "schedule") return `${base}/${role}${query}`;
  if (tab === "account") return `${base}/${role}/${role === "admin" ? "settings" : "account"}${query}`;
  if (tab === "inbox") return role === "admin" ? `${base}/admin/programs` : `${base}/${role}/${role === "teacher" ? "inbox" : "announcements"}${query}`;
  return null;
}

export function guestLoginHref(slug: string, returnTo: string) {
  return `/m/${slug}/login?returnTo=${encodeURIComponent(workspacePath(returnTo, slug))}`;
}
