const photoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);
export function programMediaType(file: { name: string; type: string }): "photo" | "video" | null {
  const type = file.type.toLowerCase();
  if (photoTypes.has(type)) return "photo";
  if (videoTypes.has(type)) return "video";
  if (type && type !== "application/octet-stream") return null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension ?? "")) return "photo";
  if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "")) return "video";
  return null;
}
export function validateProgramMediaFile(file: { name: string; type: string; size: number }) {
  const kind = programMediaType(file);
  if (!kind) return "Choose a JPEG, PNG, WebP or GIF photo, or an MP4, WebM or MOV video.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "This file is empty. Please choose another file.";
  const limit = kind === "video" ? 50 : 10;
  return file.size > limit * 1024 * 1024 ? `${kind === "video" ? "Video" : "Photo"} is too large. Choose a file under ${limit} MB.` : null;
}
