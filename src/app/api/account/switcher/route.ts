import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSwitchAccount, SWITCH_ACCOUNT_IDS, type SwitchAccount } from "@/lib/account-switching/policy";

// No elevated session creation: this endpoint only supplies labels to accounts
// already in the owner's explicit list. Actual switching requires their logins.
const accounts: SwitchAccount[] = [
  { id: SWITCH_ACCOUNT_IDS[0], name: "Amr Soliman", role: "Admin", email: "awsolim@gmail.com" },
  { id: SWITCH_ACCOUNT_IDS[1], name: "Sheikh Mohamed Moamen", role: "Teacher", email: "mohbadawy981@gmail.com" },
  { id: SWITCH_ACCOUNT_IDS[2], name: "Sheikh Abdarrahmane", role: "Teacher", email: "abdarrahmanedeyah@gmail.com" },
  { id: SWITCH_ACCOUNT_IDS[3], name: "Amr Soliman", role: "Student", email: "awsoliman01@gmail.com" },
];
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  if (!token) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  try {
    const { data: { user }, error } = await createSupabaseServerClient().auth.getUser(token);
    if (error || !user) return Response.json({ error: "Please sign in again." }, { status: 401, headers });
    if (!isSwitchAccount(user.id)) return Response.json({ error: "Unavailable for this account." }, { status: 403, headers });
    return Response.json({ accounts }, { headers });
  } catch {
    return Response.json({ error: "Could not check your account. Try again." }, { status: 503, headers });
  }
}
