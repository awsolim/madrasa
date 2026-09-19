"use client";

import { loadCachedSession, loadCachedUserAccess } from "@/lib/client-cache";
import { loadPrivateSnapshot } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Tables = Database["public"]["Tables"];
type Director = Pick<Tables["profiles"]["Row"], "id" | "full_name" | "email" | "phone_number" | "teacher_credentials" | "teacher_whatsapp_number">;
type EditorRecord = Tables["programs"]["Row"] & {
  mosque: { slug: string };
  details: Tables["program_details"]["Row"] | Tables["program_details"]["Row"][] | null;
  outcomes: Tables["program_outcomes"]["Row"][];
  contentSections: Tables["program_content_sections"]["Row"][];
  faqs: Tables["program_faqs"]["Row"][];
  media: Tables["program_media"]["Row"][];
  tracks: (Tables["program_tracks"]["Row"] & { links: Tables["program_track_sessions"]["Row"][] })[];
  sessions: Tables["program_sessions"]["Row"][];
  transferRules: Tables["program_track_transfer_rules"]["Row"][];
};

export async function loadProgramEditor(slug: string, programId: string) {
  const session = await loadCachedSession();
  if (!session) throw new Error("Log in required.");
  return loadPrivateSnapshot(`program-editor:${slug}:${programId}:${session.user.id}`, async () => {
    const supabase = createSupabaseBrowserClient();
    // PostgREST embeds related records under their existing RLS policies. All editor
    // fields, including inactive tracks, arrive together instead of ten requests
    // followed by several dependent profile/membership requests.
    const [recordResult, permissionResult, access] = await Promise.all([
      supabase.from("programs").select(`
        *, mosque:mosques!inner(slug), details:program_details(*),
        outcomes:program_outcomes(*), contentSections:program_content_sections(*),
        faqs:program_faqs(*), media:program_media(*),
        tracks:program_tracks(*, links:program_track_sessions(*)),
        sessions:program_sessions(*), transferRules:program_track_transfer_rules(*)
      `).eq("id", programId).eq("mosque.slug", slug).maybeSingle(),
      supabase.rpc("can_edit_program_details", { check_program_id: programId }),
      loadCachedUserAccess(slug, session.user.id),
    ]);
    if (recordResult.error) throw recordResult.error;
    if (permissionResult.error) throw permissionResult.error;
    const record = recordResult.data as unknown as EditorRecord | null;
    if (!record) throw new Error("Class not found.");
    if (!permissionResult.data) throw new Error("You do not have permission to edit this class.");
    const directorId = record.director_profile_id ?? record.teacher_profile_id;
    const { data: director, error: directorError } = directorId
      ? await supabase.from("profiles").select("id, full_name, email, phone_number, teacher_credentials, teacher_whatsapp_number").eq("id", directorId).maybeSingle()
      : { data: null, error: null };
    if (directorError) throw directorError;
    const sortRows = <T extends { sort_order: number | null }>(rows: T[]) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      program: record as Tables["programs"]["Row"],
      details: Array.isArray(record.details) ? record.details[0] ?? null : record.details,
      outcomes: sortRows(record.outcomes ?? []), contentSections: sortRows(record.contentSections ?? []),
      faqs: sortRows(record.faqs ?? []), media: sortRows(record.media ?? []),
      tracks: sortRows(record.tracks ?? []), trackSessionLinks: (record.tracks ?? []).flatMap(t => t.links ?? []),
      sessions: [...(record.sessions ?? [])].sort((a, b) => `${a.session_date ?? "9999"}:${a.start_time}`.localeCompare(`${b.session_date ?? "9999"}:${b.start_time}`)),
      transferRules: record.transferRules ?? [], director: director as Director | null,
      isAdminEditor: access.isMosqueAdmin,
    };
  });
}

// Director choices are not required for the first wizard screen. Fetch alongside
// the editor and apply only the choices, never overwrite fields the user is editing.
export async function loadProgramDirectorOptions(slug: string) {
  const session = await loadCachedSession();
  if (!session) return [];
  const access = await loadCachedUserAccess(slug, session.user.id);
  if (!access.isMosqueAdmin) return [];
  const snapshot = await loadPrivateSnapshot(`wizard-defaults:${slug}:${session.user.id}`, async () => {
    const { data, error } = await createSupabaseBrowserClient().rpc("get_program_create_defaults_snapshot", { p_slug: slug });
    if (error) throw error;
    return data as unknown as { teachers: Director[] };
  });
  return snapshot?.teachers ?? [];
}
