import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const maxImageBytes = 10 * 1024 * 1024;
const maxVideoBytes = 75 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function extensionFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName;
  }

  if (file.type === "image/png") {
    return "png";
  }
  if (file.type === "image/webp") {
    return "webp";
  }
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  return "jpg";
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
      return Response.json({ error: "Missing media file." }, { status: 400 });
    }

    const mediaType = allowedVideoTypes.has(file.type) ? "video" : allowedImageTypes.has(file.type) ? "photo" : null;
    if (!mediaType) return Response.json({ error: "Use a JPEG, PNG, WebP, GIF, MP4, WebM, or MOV file." }, { status: 400 });
    const maxBytes = mediaType === "video" ? maxVideoBytes : maxImageBytes;
    if (file.size > maxBytes) return Response.json({ error: `${mediaType === "video" ? "Video" : "Image"} is too large (max ${mediaType === "video" ? "75" : "10"}MB).` }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: allowed, error: allowedError } = await supabase.rpc("can_manage_program", {
      check_program_id: programId,
      check_profile_id: user.id,
    });

    if (allowedError || !allowed) {
      return Response.json({ error: "Director access required." }, { status: 403 });
    }

    const extension = extensionFromFile(file);
    const path = `program-media/${programId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return Response.json({ path, url: data.publicUrl, mediaType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload media.";
    return Response.json({ error: message }, { status: 500 });
  }
}
