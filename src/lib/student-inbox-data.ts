"use client";

import { loadPrivateSnapshot } from "@/lib/query-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchNotificationState } from "@/lib/notifications/inbox";

// Startup and the Inbox share this request. Keep messages only in memory;
// mutations explicitly bypass the freshness window when reloading the Inbox.
export function loadStudentInboxSnapshot(slug: string, userId: string, force = false) {
  return loadPrivateSnapshot(`student-inbox-raw:${slug}:${userId}`, async () => {
    const [inboxResult, notificationState] = await Promise.all([
      createSupabaseBrowserClient().rpc("get_student_inbox_snapshot", { p_slug: slug }),
      fetchNotificationState(userId),
    ]);
    if (inboxResult.error) throw inboxResult.error;
    return { inboxResult, notificationState };
  }, force);
}
