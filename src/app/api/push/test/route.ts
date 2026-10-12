import { sendPushNotification } from "@/lib/push/send-push";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = createSupabaseServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const result = await sendPushNotification(supabase, {
    recipientProfileIds: user.id,
    title: "Notifications enabled",
    body: "You’ll receive class announcements, application updates, messages, and payment alerts here.",
    url: "/",
  });

  if (!result.configured) return Response.json({ error: "Production push keys are not configured.", result }, { status: 503 });
  if (result.attempted === 0) return Response.json({ error: "No saved push subscription was found for this account.", result }, { status: 409 });
  if (result.delivered === 0) return Response.json({ error: "The test notification could not be delivered.", result }, { status: 502 });
  return Response.json({ ok: true, result });
}
