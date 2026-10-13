import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml, notificationPreferenceInstructionsHtml, notificationPreferenceInstructionsText, renderEmailShell, sendEmail } from "@/lib/email/resend";
import type { Database } from "@/lib/supabase/types";
import { filterNotificationRecipients, type NotificationCategory } from "@/lib/notifications/preferences";

type NotificationEmail = {
  eventKey: string;
  subject: string;
  title: string;
  message: string;
  action?: { label: string; href: string };
  replyTo?: string | null;
  eyebrow?: string;
  includeAdmins?: boolean;
  adminAction?: { label: string; href: string };
  category?: NotificationCategory;
};

export async function sendProfileNotificationEmails(
  supabase: SupabaseClient<Database>,
  profileIds: Array<string | null | undefined>,
  email: NotificationEmail,
) {
  const requestedIds = Array.from(new Set(profileIds.filter((id): id is string => Boolean(id))));
  const ids = await filterNotificationRecipients(supabase, requestedIds, email.category, "email");
  if (!ids.length) return { sent: 0, skipped: 0, failed: 0, reasons: [] as string[] };

  const { data: profiles, error } = await supabase.from("profiles").select("id, email, account_type").in("id", ids);
  if (error) throw new Error(error.message);

  const recipients = Array.from(new Map(
    (profiles ?? [])
      .filter((profile) => profile.email?.trim() && (email.includeAdmins || profile.account_type?.toLowerCase() !== "admin"))
      .map((profile) => [profile.email!.trim().toLowerCase(), profile]),
  ).values());
  const results = await Promise.allSettled(recipients.map((profile) => {
    return sendEmail({
    to: profile.email as string,
    subject: email.subject,
    html: renderEmailShell({
      eyebrow: email.eyebrow,
      title: email.title,
      body: `<p style="margin:0;">${escapeHtml(email.message)}</p><p style="margin:18px 0 0;color:#26323a;font-weight:600;">Open the app to view or respond to this update.</p>${notificationPreferenceInstructionsHtml}`,
    }),
    text: `${email.title}\n\n${email.message}\n\nOpen the app to view or respond to this update.\n\n${notificationPreferenceInstructionsText}`,
    replyTo: email.replyTo,
    idempotencyKey: `${email.eventKey}:${profile.id}`,
  }); }));

  const sent = results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length;
  const reasons = Array.from(new Set(results.flatMap((result) => {
    if (result.status === "rejected") return [result.reason instanceof Error ? result.reason.message : "Email delivery failed."];
    return result.value.skipped ? [result.value.reason] : [];
  })));
  return { sent, skipped: ids.length - sent, failed: results.filter((result) => result.status === "rejected").length, reasons };
}
