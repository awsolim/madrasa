import "server-only";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey?: string;
};

type SendEmailResult =
  | { ok: true; skipped: false }
  | { ok: true; skipped: true; reason: string };

export function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailShell(input: {
  eyebrow?: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  const actionHtml = input.action
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;background:#17624f;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:700;">${escapeHtml(input.action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f1e8;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#26323a;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3ded3;border-radius:20px;padding:30px;"><p style="margin:0 0 10px;color:#17624f;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(input.eyebrow || "Madrasa")}</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#26323a;">${escapeHtml(input.title)}</h1><div style="font-size:15px;line-height:1.7;color:#52616a;">${input.body}</div>${actionHtml}<p style="margin:30px 0 0;border-top:1px solid #ece8df;padding-top:18px;color:#7b858c;font-size:12px;line-height:1.6;">This is an account notification from Madrasa.</p></div></body></html>`;
}

export async function sendEmail({ to, subject, html, text, replyTo, idempotencyKey }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const isTestEnvironment = process.env.MADRASA_TEST_ENVIRONMENT === "true";
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT?.trim();

  if (isTestEnvironment && !testRecipient) {
    return { ok: true, skipped: true, reason: "Test email delivery is disabled until EMAIL_TEST_RECIPIENT is configured." };
  }

  if (!apiKey) {
    return { ok: true, skipped: true, reason: "Missing RESEND_API_KEY." };
  }

  if (!from) {
    return { ok: true, skipped: true, reason: "Missing RESEND_FROM_EMAIL." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from,
      to: isTestEnvironment ? testRecipient : to,
      subject: isTestEnvironment ? `[TEST] ${subject}` : subject,
      html,
      text,
      reply_to: replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend email failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  return { ok: true, skipped: false };
}
