import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type UpdateEmailBody = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as UpdateEmailBody;
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email) {
      return Response.json({ error: "Email cannot be empty." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: updatedAuth, error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    if (authError || !updatedAuth.user?.email) {
      return Response.json({ error: authError?.message ?? "Login email could not be updated." }, { status: 400 });
    }

    const confirmedEmail = updatedAuth.user.email;
    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ email: confirmedEmail, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select("*")
      .maybeSingle();

    if (profileError || !updatedProfile) {
      return Response.json(
        { error: profileError?.message ?? "Login email changed, but the profile record could not be synchronized." },
        { status: 500 },
      );
    }

    return Response.json({ email: confirmedEmail, profile: updatedProfile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be updated.";
    return Response.json({ error: message }, { status: 500 });
  }
}
