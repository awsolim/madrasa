import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ProgramAuthResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Server-side check for application-decision authority: admin, or a director
 * assigned to this program. Instructors can also receive application decision
 * and finance permissions independently through their class assignment.
 */
export async function requireProgramManageAccess(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
): Promise<ProgramAuthResult> {
  const { data: canManage, error } = await supabase.rpc("can_manage_program", {
    check_program_id: programId,
    check_profile_id: userId,
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!canManage) {
    return { ok: false, status: 403, error: "You don't have permission to manage this class." };
  }
  return { ok: true };
}

/**
 * Server-side check for deciding (approve/waitlist/reject/reopen/etc.) applications: admin,
 * director, or an instructor explicitly granted can_decide_applications on this program.
 */
export async function requireProgramApplicationDecisionAccess(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
): Promise<ProgramAuthResult> {
  const { data: canDecide, error } = await supabase.rpc("can_decide_program_applications", {
    check_program_id: programId,
    check_profile_id: userId,
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!canDecide) {
    return { ok: false, status: 403, error: "You don't have permission to decide applications for this class." };
  }
  return { ok: true };
}

/**
 * Server-side check for editing class details: admin, director, or an instructor explicitly
 * granted can_edit_class on this program. Deliberately not used for deleting a class — that
 * stays director/admin-only via requireProgramManageAccess.
 */
export async function requireProgramEditAccess(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
): Promise<ProgramAuthResult> {
  const { data: canEdit, error } = await supabase.rpc("can_edit_program_details", {
    check_program_id: programId,
    check_profile_id: userId,
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!canEdit) {
    return { ok: false, status: 403, error: "You don't have permission to edit this class." };
  }
  return { ok: true };
}

export async function requireProgramStudentRecordAccess(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
) {
  return requireProgramCapability(supabase, programId, userId, "can_view_program_student_records", "You do not have permission to view private student records.");
}

export async function requireProgramEnrollmentAccess(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
) {
  return requireProgramCapability(supabase, programId, userId, "can_manage_program_enrollments", "You do not have permission to manage enrollments.");
}

async function requireProgramCapability(
  supabase: SupabaseClient<Database>,
  programId: string,
  userId: string,
  capability: "can_view_program_student_records" | "can_manage_program_enrollments",
  forbiddenMessage: string,
) {
  const { data: allowed, error } = await supabase.rpc(capability, {
    check_program_id: programId,
    check_profile_id: userId,
  });
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!allowed) return { ok: false as const, status: 403, error: forbiddenMessage };
  return { ok: true as const };
}
