import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const maxAttachmentBytes = 25 * 1024 * 1024;
const allowedMimePrefixes = ["audio/", "image/"];
const allowedMimeTypes = new Set(["application/pdf", "text/plain"]);

function extensionFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }
  if (file.type.includes("webm")) {
    return "webm";
  }
  if (file.type.includes("mpeg")) {
    return "mp3";
  }
  if (file.type.includes("mp4")) {
    return "m4a";
  }
  if (file.type === "image/png") {
    return "png";
  }
  if (file.type === "image/webp") {
    return "webp";
  }
  if (file.type === "application/pdf") {
    return "pdf";
  }
  return "bin";
}

function attachmentKind(file: File) {
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  return "file";
}

function isAllowedFile(file: File) {
  return allowedMimePrefixes.some((prefix) => file.type.startsWith(prefix)) || allowedMimeTypes.has(file.type);
}

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing attachment file." }, { status: 400 });
    }
    if (file.size > maxAttachmentBytes) {
      return Response.json({ error: "Attachment must be 25 MB or smaller." }, { status: 400 });
    }
    if (!isAllowedFile(file)) {
      return Response.json({ error: "Use an audio, image, PDF, or text file." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: allowed, error: allowedError } = await supabase.rpc("is_program_teacher", {
      check_program_id: programId,
      check_profile_id: user.id,
    });

    if (allowedError || !allowed) {
      return Response.json({ error: "Teacher access required." }, { status: 403 });
    }

    const extension = extensionFromFile(file);
    const path = `program-message-attachments/${programId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return Response.json({
      attachment: {
        id: crypto.randomUUID(),
        kind: attachmentKind(file),
        url: data.publicUrl,
        path,
        name: file.name || "Attachment",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload attachment.";
    return Response.json({ error: message }, { status: 500 });
  }
}
