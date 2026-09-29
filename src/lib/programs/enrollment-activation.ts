import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type SupaClient = SupabaseClient<Database>;

export async function selectedTrackIdsForRequest(supabase: SupaClient, enrollmentRequestId: string, fallbackTrackId: string | null): Promise<string[]> {
  const { data } = await supabase.from("enrollment_request_tracks").select("program_track_id").eq("enrollment_request_id", enrollmentRequestId);
  const trackIds = (data ?? []).map((row) => row.program_track_id).filter((id): id is string => Boolean(id));
  return trackIds.length ? trackIds : fallbackTrackId ? [fallbackTrackId] : [];
}

export async function replaceEnrollmentTracks(supabase: SupaClient, enrollmentId: string, trackIds: string[]) {
  await supabase.from("enrollment_tracks").delete().eq("enrollment_id", enrollmentId);
  if (trackIds.length) {
    await supabase.from("enrollment_tracks").insert(trackIds.map((trackId) => ({ enrollment_id: enrollmentId, program_track_id: trackId })));
  }
}

/**
 * The single place enrollment activation happens once an approved
 * application is completed — called from the free/waived confirm endpoint,
 * the Stripe webhook, and the client-triggered Stripe confirm fallback, so
 * all three paths leave enrollment_requests/enrollments in identical state
 * instead of each maintaining its own slightly-different copy.
 */
export async function activateEnrollmentForRequest(
  supabase: SupaClient,
  params: { enrollmentRequestId: string; programId: string; studentProfileId: string; fallbackTrackId: string | null },
): Promise<string[]> {
  const { data, error } = await supabase.rpc("finalize_no_payment_program_enrollment" as never, {
    p_enrollment_request_id: params.enrollmentRequestId,
  } as never);
  if (error) throw error;
  const result = data as unknown as { enrollmentId?: string; trackIds?: string[] } | null;
  if (!result?.enrollmentId) throw new Error("Enrollment activation did not finish saving.");
  return result.trackIds ?? [];
}
