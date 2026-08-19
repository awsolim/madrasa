"use client";

import { useEffect } from "react";
import {
  fetchAdminProgramsWithTracks,
  fetchMosqueProgramsSnapshot,
  fetchStudentEnrollments,
  fetchTeacherPrograms,
} from "@/components/data/supabase-public-sections";
import { fetchStudentNotificationCounts, fetchTeacherNotificationCounts } from "@/hooks/use-notification-counts";
import { loadCachedSession } from "@/lib/client-cache";
import { prefetchQuery } from "@/lib/query-cache";

// Warms exactly the data each role's Home/Classes tab needs, right after the app shell mounts
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

      if (section === "teacher" && userId) {
        prefetchQuery(`teacher-programs:${slug}`, () => fetchTeacherPrograms(slug));
        prefetchQuery(`notification-counts:teacher:${slug}:${userId}`, () => fetchTeacherNotificationCounts(slug, userId));
      }

      if (section === "admin" && userId) {
        prefetchQuery(`teacher-programs:${slug}`, () => fetchTeacherPrograms(slug));
        prefetchQuery(`admin-programs:${slug}`, () => fetchAdminProgramsWithTracks(slug));
        prefetchQuery(`notification-counts:teacher:${slug}:${userId}`, () => fetchTeacherNotificationCounts(slug, userId));
      }

      if (section === "portal" || section === "public") {
        prefetchQuery(`mosque-programs:${slug}`, () => fetchMosqueProgramsSnapshot(slug));
        if (userId) {
          prefetchQuery(`student-enrollments:${slug}:${userId}`, () => fetchStudentEnrollments(slug, userId));
          prefetchQuery(`notification-counts:student:${slug}:${userId}`, () => fetchStudentNotificationCounts(slug, userId));
        }
      }
    }

    void warm();
    return () => {
      cancelled = true;
    };
  }, [slug, section]);

  return null;
}
