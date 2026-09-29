"use client";
import { loadCachedSession } from "@/lib/client-cache";
import { loadPrivateSnapshot } from "@/lib/query-cache";
import type { StudentTimelineEvent } from "@/lib/student-timeline";
export type StudentActivity = StudentTimelineEvent;
export async function loadStudentActivity(programId: string, studentProfileId: string, scope: "application" | "finance") {
  const session = await loadCachedSession();
  if (!session) throw new Error("Please sign in again.");
  return loadPrivateSnapshot(`student-activity:${scope}:${programId}:${studentProfileId}:${session.user.id}`, async () => {
    const response = await fetch(`/api/programs/${programId}/student-activity`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ studentProfileId, scope }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load activity.");
    return result.events as StudentActivity[];
  });
}
