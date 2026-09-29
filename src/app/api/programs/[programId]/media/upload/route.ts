import { programMediaType } from "@/lib/program-media";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { logServerError } from "@/lib/monitoring/log-error";

export const runtime = "nodejs";

const maxImageBytes = 10 * 1024 * 1024;
const maxVideoBytes = 50 * 1024 * 1024;
function extensionFromFile(file: Pick<File, "name" | "type">) {
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

    const body = (await request.json().catch(() => null)) as { name?: string; type?: string; size?: number } | null;
    const name = body?.name?.trim() ?? "";
    const type = body?.type?.trim().toLowerCase() ?? "";
    const size = Number(body?.size);
    if (!name || !Number.isFinite(size) || size <= 0) return Response.json({ error: "Missing media file details." }, { status: 400 });

    const mediaType = programMediaType({ name, type });
    if (!mediaType) return Response.json({ error: "Use a JPEG, PNG, WebP, GIF, MP4, WebM, or MOV file." }, { status: 400 });
    const maxBytes = mediaType === "video" ? maxVideoBytes : maxImageBytes;
    if (size > maxBytes) return Response.json({ error: `${mediaType === "video" ? "Video" : "Image"} is too large (max ${mediaType === "video" ? "50" : "10"} MB).` }, { status: 400 });

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: allowed, error: allowedError } = await supabase.rpc("can_edit_program_details", {
      check_program_id: programId,
      check_profile_id: user.id,
    });

    if (allowedError || !allowed) {
      return Response.json({ error: "Class editing permission is required." }, { status: 403 });
    }

    const extension = extensionFromFile({ name, type });
    const path = `program-media/${programId}/${crypto.randomUUID()}.${extension}`;
    const { data: signedUpload, error: uploadError } = await supabase.storage.from("media").createSignedUploadUrl(path);
    if (uploadError || !signedUpload?.token) return Response.json({ error: "Could not prepare the upload. Please try again." }, { status: 500 });

    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return Response.json({ path, token: signedUpload.token, url: data.publicUrl, mediaType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload media.";
    await logServerError(createSupabaseServiceClient(), {
      source: "programs.media.upload",
      message,
      context: { ...(await params) },
    });
    return Response.json({ error: "Could not prepare the upload. Please try again." }, { status: 500 });
  }
}
