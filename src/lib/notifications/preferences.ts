import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type NotificationCategory = "applications" | "messages" | "class_updates" | "billing_alerts" | "payment_activity" | "withdrawals";
export type NotificationChannel = "push" | "email";

const defaultPreferences: Record<NotificationCategory, { push: boolean; email: boolean }> = {
  applications: { push: true, email: true },
  messages: { push: true, email: false },
  class_updates: { push: true, email: true },
  billing_alerts: { push: true, email: true },
  payment_activity: { push: true, email: false },
  withdrawals: { push: true, email: true },
};

export async function filterNotificationRecipients(
  supabase: SupabaseClient<Database>,
  profileIds: string[],
  category: NotificationCategory | undefined,
  channel: NotificationChannel,
) {
  if (!category || profileIds.length === 0) return profileIds;
  const { data, error } = await supabase
    .from("notification_delivery_preferences")
    .select("profile_id, push_enabled, email_enabled")
    .in("profile_id", profileIds)
    .eq("category", category);
  if (error) return profileIds;
  const rows = new Map((data ?? []).map((row) => [row.profile_id, row]));
  return profileIds.filter((profileId) => {
    const row = rows.get(profileId);
    return row ? (channel === "push" ? row.push_enabled : row.email_enabled) : defaultPreferences[category][channel];
  });
}

