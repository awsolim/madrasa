"use client";

import { useEffect } from "react";
import {
  fetchAdminProgramsWithTracks,
  fetchAdminMasjidSnapshot,
  fetchApplicantApplications,
  fetchMosqueProgramsSnapshot,
  fetchStudentEnrollments,
  fetchTeacherPrograms,
} from "@/components/data/supabase-public-sections";
import { fetchStudentNotificationCounts, fetchTeacherNotificationCounts } from "@/hooks/use-notification-counts";
import { fetchTeacherInboxSnapshot } from "@/components/data/teacher-inbox";
import { loadCachedSession, loadCachedProfileSummary, loadCachedUserAccess } from "@/lib/client-cache";
import { loadStudentInboxSnapshot } from "@/lib/student-inbox-data";
import { prefetchQuery } from "@/lib/query-cache";

// Warms primary-tab content right after the app shell mounts, without gating rendering.
// -- before you've tapped anything. Combined with the query cache now persisting to
// localStorage, this means a fresh app open can have Home and Classes already resident by the
// time you look at them, not just fast once you've visited once this session. Mirrors the
// same cache keys/fetchers each page's own useCachedQuery call already uses, so a warm entry
// here is read directly -- no separate cache, no risk of double-fetching.
export function PrimaryNavPrefetch({ slug, section }: { slug: string; section: "public" | "portal" | "teacher" | "admin" }) {
  useEffect(() => {
    let cancelled = false;

    async function warm() {
      const session = await loadCachedSession();
      if (cancelled) {
        return;
      }
      const userId = session?.user.id ?? null;
      if (userId) {
        // Me uses these same caches for its initial identity and account menu.
        void loadCachedProfileSummary(userId).catch(() => undefined);
        void loadCachedUserAccess(slug, userId).catch(() => undefined);
      }

      if (section === "teacher" && userId) {
        prefetchQuery(`teacher-programs:${slug}:${userId}`, () => fetchTeacherPrograms(slug));
        prefetchQuery(`notification-counts:teacher:${slug}:${userId}`, () => fetchTeacherNotificationCounts(slug, userId));
        // Warm the same full snapshot the Inbox reads, not only its badge count.
        // Keep private messages in memory and let an actual visit share this request.
        prefetchQuery(`teacher-inbox:${slug}:${userId}`, () => fetchTeacherInboxSnapshot(slug), { persist: false });
      }

      if (section === "admin" && userId) {
        prefetchQuery(`admin-masjid:${slug}`, () => fetchAdminMasjidSnapshot(slug));
        prefetchQuery(`teacher-programs:${slug}:${userId}`, () => fetchTeacherPrograms(slug));
        prefetchQuery(`admin-programs:${slug}:${userId}`, () => fetchAdminProgramsWithTracks(slug));
        prefetchQuery(`notification-counts:teacher:${slug}:${userId}`, () => fetchTeacherNotificationCounts(slug, userId));
      }

      if (section === "portal" || section === "public") {
        prefetchQuery(`mosque-programs:${slug}`, () => fetchMosqueProgramsSnapshot(slug));
        if (userId) {
          prefetchQuery(`student-enrollments:${slug}:${userId}`, () => fetchStudentEnrollments(slug, userId));
          prefetchQuery(`student-applications:${slug}:${userId}`, () => fetchApplicantApplications(slug, userId));
          void loadStudentInboxSnapshot(slug, userId).catch(() => undefined);
          prefetchQuery(`notification-counts:student:${slug}:${userId}`, () => fetchStudentNotificationCounts(slug, userId));
        }
      }
    }

    void warm().catch(() => undefined); // Speculative work must not interrupt the current page.
    return () => {
      cancelled = true;
    };
  }, [slug, section]);

  return null;
}
