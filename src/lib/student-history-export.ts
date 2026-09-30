"use client";

import { loadCachedSession } from "@/lib/client-cache";

export async function downloadStudentHistory(programId: string, studentId: string, studentName: string) {
  const session = await loadCachedSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch(`/api/programs/${programId}/students/${studentId}/history-export`, {
    headers: { authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || "Could not prepare the student history report.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]
    ?? `${studentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "student"}-history.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
