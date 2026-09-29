import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml, renderEmailShell, sendEmail } from "@/lib/email/resend";
import type { Database } from "@/lib/supabase/types";

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
};

export async function sendProfileNotificationEmails(
  supabase: SupabaseClient<Database>,
  profileIds: Array<string | null | undefined>,
  email: NotificationEmail,
) {
  const ids = Array.from(new Set(profileIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) return { sent: 0, skipped: 0 };

  const { data: profiles, error } = await supabase.from("profiles").select("id, email, account_type").in("id", ids);
  if (error) throw new Error(error.message);

  const recipients = Array.from(new Map(
    (profiles ?? [])
      .filter((profile) => profile.email?.trim() && (email.includeAdmins || profile.account_type?.toLowerCase() !== "admin"))
      .map((profile) => [profile.email!.trim().toLowerCase(), profile]),
  ).values());
  const results = await Promise.allSettled(recipients.map((profile) => {
    const action = profile.account_type?.toLowerCase() === "admin" ? email.adminAction ?? email.action : email.action;
    return sendEmail({
    to: profile.email as string,
    subject: email.subject,
    html: renderEmailShell({
      eyebrow: email.eyebrow,
      title: email.title,
      body: `<p style="margin:0;">${escapeHtml(email.message)}</p>`,
      action,
    }),
    text: `${email.title}\n\n${email.message}${action ? `\n\n${action.label}: ${action.href}` : ""}`,
    replyTo: email.replyTo,
    idempotencyKey: `${email.eventKey}:${profile.id}`,
  }); }));

  return {
    sent: results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length,
    skipped: ids.length - results.filter((result) => result.status === "fulfilled" && !result.value.skipped).length,
  };
}
