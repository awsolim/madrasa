import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Everyone whose teacher inbox covers a program: the primary director/teacher
 * plus all active director and instructor assignments. Email delivery applies a
 * separate account-type filter so mosque admins are never emailed.
 */
export async function getProgramManagerProfileIds(
  supabase: SupabaseClient<Database>,
  program: { id: string; director_profile_id: string | null; teacher_profile_id: string | null },
): Promise<string[]> {
  const { data: teacherAssignments } = await supabase
    .from("program_teachers")
    .select("teacher_profile_id")
    .eq("program_id", program.id)
    .in("role", ["director", "instructor"])
    .not("teacher_profile_id", "is", null);

  return Array.from(
    new Set(
      [program.director_profile_id ?? program.teacher_profile_id, ...(teacherAssignments ?? []).map((row) => row.teacher_profile_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
}

/** Staff who can act on a new application for this class. */
export async function getProgramApplicationReviewerProfileIds(
  supabase: SupabaseClient<Database>,
  program: { id: string; director_profile_id: string | null; teacher_profile_id: string | null },
): Promise<string[]> {
  const { data: assignments, error } = await supabase.from("program_teachers")
    .select("teacher_profile_id, role, can_decide_applications")
    .eq("program_id", program.id)
    .not("teacher_profile_id", "is", null);
  if (error) throw new Error(error.message);
  const candidateIds = Array.from(new Set([
    program.director_profile_id ?? program.teacher_profile_id,
    ...(assignments ?? []).filter((row) => row.role === "director" || (row.role === "instructor" && row.can_decide_applications)).map((row) => row.teacher_profile_id),
  ].filter((id): id is string => Boolean(id))));
  const authorized = await Promise.all(candidateIds.map(async (profileId) => {
    const { data, error: accessError } = await supabase.rpc("can_decide_program_applications", { check_program_id: program.id, check_profile_id: profileId });
    if (accessError) throw new Error(accessError.message);
    return data ? profileId : null;
  }));
  return authorized.filter((id): id is string => Boolean(id));
}
