// Shared with next.config.ts so profile-photo validation and the optimizer's
// allowlist agree. Keep HTTPS and standard ports for remote profile images.
export const profileImageRemotePatterns = [
  { protocol: "https", hostname: "**.supabase.co", port: "" },
  { protocol: "https", hostname: "*.googleusercontent.com", port: "" },
] as const;

export function canHaveProfilePhoto(accountType: string | null | undefined): boolean {
  return ["teacher", "admin"].includes(accountType?.trim().toLowerCase() ?? "");
}

export function supportedProfileImage(src: string | null | undefined): string | null {
  const value = src?.trim();
  if (!value) return null;
  // Existing staff photo editing produces cropped raster data URLs.
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    if (url.hostname.endsWith(".supabase.co") || /^[^.]+\.googleusercontent\.com$/.test(url.hostname)) return url.href;
  } catch {
    // Malformed or unsupported profile photos fall back to initials.
  }
  return null;
}
