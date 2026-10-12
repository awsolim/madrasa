export const runtime = "nodejs";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  if (!publicKey) return Response.json({ configured: false, publicKey: null });
  return Response.json({ configured: true, publicKey }, { headers: { "cache-control": "public, max-age=300" } });
}
