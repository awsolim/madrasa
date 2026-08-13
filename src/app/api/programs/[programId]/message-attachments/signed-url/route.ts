import { normalizeMessageAttachments } from "@/lib/messages/attachments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type SignedUrlRequestBody = {
  source?: "announcement" | "note";
  messageId?: string;
};

const signedUrlExpirySeconds = 60 * 60;

export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SignedUrlRequestBody;
    const source = body.source === "note" ? "note" : body.source === "announcement" ? "announcement" : null;
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (!source || !messageId) {
      return Response.json({ error: "Missing attachment reference." }, { status: 400 });
    }

    // Scoped to the caller's own token, so this select only succeeds if the caller
    // can already read this specific announcement/note under existing RLS.
    const scoped = createSupabaseServerClient(token);
    const table = source === "note" ? "program_student_notes" : "program_announcements";
    const { data: message, error: messageError } = await scoped
      .from(table)
      .select("id, program_id, attachments")
      .eq("id", messageId)
      .eq("program_id", programId)
      .maybeSingle();

    if (messageError || !message) {
      return Response.json({ error: "Not found or access denied." }, { status: 404 });
    }

    const attachments = normalizeMessageAttachments(message.attachments);
    const service = createSupabaseServiceClient();
    const urls: Record<string, string> = {};
    await Promise.all(
      attachments
        .filter((attachment) => Boolean(attachment.path))
        .map(async (attachment) => {
          const { data } = await service.storage.from("message-attachments").createSignedUrl(attachment.path!, signedUrlExpirySeconds);
          if (data?.signedUrl) {
            urls[attachment.id] = data.signedUrl;
          }
        }),
    );

    return Response.json({ urls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create signed attachment URL.";
    return Response.json({ error: message }, { status: 500 });
  }
}
