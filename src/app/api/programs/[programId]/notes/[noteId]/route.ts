import { normalizeMessageAttachments } from "@/lib/messages/attachments";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ programId: string; noteId: string }> }) {
  try {
    const { programId, noteId } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
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

    const { data: note, error: noteError } = await supabase
      .from("program_student_notes")
      .select("id, program_id, attachments")
      .eq("id", noteId)
      .eq("program_id", programId)
      .maybeSingle();
    if (noteError || !note) {
      return Response.json({ error: "Note not found." }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from("program_student_notes").delete().eq("id", noteId);
    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    // Best-effort: the note is already gone either way, so a storage failure here
    // shouldn't surface as a delete failure to the teacher.
    const paths = normalizeMessageAttachments(note.attachments)
      .map((attachment) => attachment.path)
      .filter((path): path is string => Boolean(path));
    if (paths.length) {
      await supabase.storage.from("message-attachments").remove(paths).catch(() => null);
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete note.";
    return Response.json({ error: message }, { status: 500 });
  }
}
