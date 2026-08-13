import type { Json } from "@/lib/supabase/types";

export type MessageAttachment = {
  id: string;
  kind: "audio" | "image" | "file";
  url: string;
  path?: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export function normalizeMessageAttachments(value: Json | undefined): MessageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): MessageAttachment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, Json | undefined>;
      const kind = record.kind === "audio" || record.kind === "image" || record.kind === "file" ? record.kind : "file";
      const url = typeof record.url === "string" ? record.url : "";
      const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : kind === "audio" ? "Voice note" : "Attachment";
      if (!url) {
        return null;
      }
      return {
        id: typeof record.id === "string" ? record.id : url,
        kind,
        url,
        path: typeof record.path === "string" ? record.path : undefined,
        name,
        mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
        size: typeof record.size === "number" ? record.size : undefined,
      };
    })
    .filter((attachment): attachment is MessageAttachment => Boolean(attachment));
}

export function formatAttachmentSize(size?: number) {
  if (!size || size < 1) {
    return "";
  }
  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function attachmentDisplayName(attachment: MessageAttachment) {
  if (attachment.kind === "audio") {
    return "Voice note";
  }
  if (attachment.kind === "image") {
    return "Image attachment";
  }
  return "File attachment";
}

export function attachmentMetaLabel(attachment: MessageAttachment) {
  const size = formatAttachmentSize(attachment.size);
  if (attachment.kind === "audio") {
    return size ? `Audio ${size}` : "Audio";
  }
  if (attachment.kind === "image") {
    return size ? `Image ${size}` : "Image";
  }
  return size || "Attached file";
}
