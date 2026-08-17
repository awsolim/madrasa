import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ProfileUpdateBody = {
  field?: "fullName" | "password" | "phone" | "dateOfBirth";
  value?: string;
};

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json()) as ProfileUpdateBody;
    const field = body.field;
    const value = typeof body.value === "string" ? body.value.trim() : "";
    if (!field || !["fullName", "password", "phone", "dateOfBirth"].includes(field)) {
      return Response.json({ error: "Unsupported account field." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return Response.json({ error: "Not authenticated." }, { status: 401 });

    if (field === "password") {
      if (value.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
      const { error } = await supabase.auth.admin.updateUserById(user.id, { password: value });
      if (error) return Response.json({ error: error.message }, { status: 400 });
    } else {
      if (field === "dateOfBirth" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return Response.json({ error: "Enter a valid date of birth." }, { status: 400 });
      }
      const updates = field === "fullName"
        ? { full_name: value || null, updated_at: new Date().toISOString() }
        : field === "phone"
          ? { phone_number: value || null, updated_at: new Date().toISOString() }
          : { date_of_birth: value || null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (error) return Response.json({ error: error.message }, { status: 400 });
      if (field === "fullName") {
        const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, full_name: value || null },
        });
        if (metadataError) return Response.json({ error: metadataError.message }, { status: 400 });
      }
    }

    const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (profileError || !profile) return Response.json({ error: profileError?.message ?? "Profile could not be reloaded." }, { status: 500 });
    return Response.json({ profile });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account could not be updated." }, { status: 500 });
  }
}
