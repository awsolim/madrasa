import type { Dispatch, SetStateAction } from "react";
import { isApplicationActionRequired } from "@/lib/programs/applicant-actions";
import { getApplicationStatus } from "@/lib/programs/applications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type EnrollmentRequest = Database["public"]["Tables"]["enrollment_requests"]["Row"];
type WithdrawalRequest = Database["public"]["Tables"]["withdrawal_requests"]["Row"];

export type InstructorLifecycleNotification = {
  id: string;
  program_id: string;
  assignment_id: string | null;
  teacher_profile_id: string | null;
  event_type: "joined" | "resigned";
  created_at: string | null;
  program?: Program | null;
  instructor?: Profile | null;
};

export type NotificationCounts = {
  announcementCount: number;
  noteCount: number;
  requestCount: number;
  actionRequired: boolean;
};

/**
 * Durable, per-account notification seen/dismissed state. Shared by teacher and
 * student/parent inbox surfaces; keys are intentionally generic.
 */
export async function fetchNotificationState(userId: string | null | undefined): Promise<{ seen: Set<string>; dismissed: Set<string> }> {
  if (!userId) {
    return { seen: new Set(), dismissed: new Set() };
  }
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("teacher_notification_state").select("notification_key, seen_at, dismissed_at").eq("user_id", userId);
  if (error) {
    console.error("Failed to load notification seen/dismissed state:", error.message);
  }
  const seen = new Set((data ?? []).filter((row) => row.seen_at).map((row) => row.notification_key));
  const dismissed = new Set((data ?? []).filter((row) => row.dismissed_at).map((row) => row.notification_key));
  return { seen, dismissed };
}

export async function markNotificationsSeen(userId: string | null | undefined, keys: string[]): Promise<boolean> {
  if (!userId || keys.length === 0) {
    return true;
  }
  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("teacher_notification_state")
    .upsert(
      keys.map((key) => ({ user_id: userId, notification_key: key, seen_at: now })),
      { onConflict: "user_id,notification_key" },
    );
  if (error) {
    console.error("Failed to persist notification seen state:", error.message);
    return false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }
  return true;
}

export async function markNotificationsDismissed(userId: string | null | undefined, keys: string[]): Promise<boolean> {
  if (!userId || keys.length === 0) {
    return true;
  }
  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("teacher_notification_state")
    .upsert(
      keys.map((key) => ({ user_id: userId, notification_key: key, seen_at: now, dismissed_at: now })),
      { onConflict: "user_id,notification_key" },
    );
  if (error) {
    console.error("Failed to persist notification dismissed state:", error.message);
    return false;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("tareeqah:notifications-changed"));
  }
  return true;
}

export function revertOptimisticKeys(setter: Dispatch<SetStateAction<Set<string>>>, keys: string[]) {
  setter((current) => {
    const next = new Set(current);
    for (const key of keys) {
      next.delete(key);
    }
    return next;
  });
}

export function studentRequestNotificationKey(request: Pick<EnrollmentRequest, "id" | "status" | "reviewed_at" | "requested_at">) {
  return [request.id, request.status, request.reviewed_at ?? request.requested_at ?? ""].join(":");
}

export function studentRequestShouldNotify(request: Pick<EnrollmentRequest, "status" | "reviewed_at">) {
  return request.status !== "pending" || Boolean(request.reviewed_at);
}

export function studentRequestRequiresAction(request: EnrollmentRequest) {
  return isApplicationActionRequired(getApplicationStatus(request));
}

export function studentWithdrawalNotificationKey(request: Pick<WithdrawalRequest, "id" | "status" | "reviewed_at" | "requested_at">) {
  return ["withdrawal", request.id, request.status, request.reviewed_at ?? request.requested_at ?? ""].join(":");
}

export function teacherRequestNotificationKey(request: Pick<EnrollmentRequest, "id" | "status" | "requested_at" | "reviewed_at" | "admission_completed_at">) {
  if (request.admission_completed_at) {
    return ["admission-complete", request.id, request.admission_completed_at].join(":");
  }
  return ["application", request.id, request.requested_at ?? ""].join(":");
}

export function teacherRequestShouldBeUnread(
  request: Pick<EnrollmentRequest, "id" | "status" | "requested_at" | "reviewed_at" | "admission_completed_at">,
  seenIds: Set<string>,
) {
  if (request.admission_completed_at) {
    return !seenIds.has(teacherRequestNotificationKey(request));
  }
  if (request.status !== "pending") {
    return false;
  }
  return !seenIds.has(teacherRequestNotificationKey(request));
}

export function teacherInstructorNotificationKey(notification: Pick<InstructorLifecycleNotification, "id" | "event_type" | "teacher_profile_id">) {
  return ["instructor", notification.event_type, notification.id, notification.teacher_profile_id ?? ""].join(":");
}
