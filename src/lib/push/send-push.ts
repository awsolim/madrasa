import "server-only";

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { logServerError } from "@/lib/monitoring/log-error";
import { filterNotificationRecipients, type NotificationCategory } from "@/lib/notifications/preferences";

export type PushDeliveryResult = {
  attempted: number;
  delivered: number;
  expired: number;
  failed: number;
  configured: boolean;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) {
    return;
  }
  webpush.setVapidDetails(requireEnv("VAPID_SUBJECT"), requireEnv("VAPID_PUBLIC_KEY"), requireEnv("VAPID_PRIVATE_KEY"));
  vapidConfigured = true;
}

/**
 * Sends a real browser push notification to every device the given profile(s) subscribed
 * from. Mirrors recordFinanceAuditEvent's calling convention (server-only, takes an
 * already-created service-role client, never throws into the caller) — a failed push should
 * never break the action that triggered it. `url` is resolved relative to the app origin by
 * the service worker's notificationclick handler (public/sw.js), so pass an app path like
 * `/m/{slug}/teacher/inbox`, not an absolute URL.
 */
export async function sendPushNotification(
  supabase: SupabaseClient<Database>,
  options: { recipientProfileIds: string | (string | null | undefined)[]; title: string; body: string; url?: string; category?: NotificationCategory },
): Promise<PushDeliveryResult> {
  const result: PushDeliveryResult = { attempted: 0, delivered: 0, expired: 0, failed: 0, configured: true };
  try {
    ensureVapidConfigured();
    const requestedRecipientIds = Array.from(
      new Set((Array.isArray(options.recipientProfileIds) ? options.recipientProfileIds : [options.recipientProfileIds]).filter((id): id is string => Boolean(id))),
    );
    const recipientIds = await filterNotificationRecipients(supabase, requestedRecipientIds, options.category, "push");
    if (recipientIds.length === 0) {
      return result;
    }

    const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("profile_id", recipientIds);
    if (!subscriptions?.length) {
      return result;
    }

    result.attempted = subscriptions.length;

    const payload = JSON.stringify({ title: options.title, body: options.body, url: options.url ?? "/" });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
          result.delivered += 1;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
            result.expired += 1;
            return;
          }
          result.failed += 1;
          await logServerError(supabase, {
            source: "push.delivery",
            message: error instanceof Error ? error.message : "Push provider rejected a notification.",
            context: { subscriptionId: subscription.id, statusCode: statusCode ?? null },
          });
        }
      }),
    );
    return result;
  } catch (error) {
    result.configured = !((error instanceof Error ? error.message : "").includes("Missing required environment variable"));
    result.failed = Math.max(result.failed, result.attempted || 1);
    await logServerError(supabase, {
      source: "push.send",
      message: error instanceof Error ? error.message : "Push notification delivery failed.",
      context: { title: options.title, attempted: result.attempted },
    });
    return result;
  }
}
