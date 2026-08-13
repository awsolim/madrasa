import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type SwitchRequestBody = {
  profileId?: string;
  slug?: string;
};

// This endpoint lists every profile in the database and can mint a magic-link login for
// any of them — it must never be reachable outside a developer's own machine. NODE_ENV
// alone isn't a safe enough guard (a misconfigured host, a `next start` after a dev build,
// or a preview deploy that doesn't set NODE_ENV=production would all silently re-enable
// it), so this also requires an explicit opt-in env var that must never be set anywhere
// but a local .env.local.
function requireDevelopmentMode() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_ACCOUNT_SWITCHER !== "true") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return null;
}

function getOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, "");
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  return new URL(request.url).origin;
}

export async function GET() {
  try {
    const blocked = requireDevelopmentMode();
    if (blocked) {
      return blocked;
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, account_type")
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      accounts: (data ?? [])
        .filter((profile) => Boolean(profile.email))
        .map((profile) => ({
          id: profile.id,
          label: profile.full_name || profile.email || "Unnamed account",
          email: profile.email,
          accountType: profile.account_type || "student",
        })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load development accounts.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const blocked = requireDevelopmentMode();
    if (blocked) {
      return blocked;
    }

    const body = (await request.json()) as SwitchRequestBody;
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    const slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : "assiddiq";

    if (!profileId) {
      return Response.json({ error: "Missing account." }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("email").eq("id", profileId).maybeSingle();

    if (profileError || !profile?.email) {
      return Response.json({ error: profileError?.message ?? "Account email not found." }, { status: 404 });
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
      options: {
        redirectTo: `${getOrigin(request)}/m/${slug}/auth/callback`,
      },
    });

    if (error || !data.properties?.action_link) {
      return Response.json({ error: error?.message ?? "Could not generate switch link." }, { status: 500 });
    }

    return Response.json({ url: data.properties.action_link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not switch account.";
    return Response.json({ error: message }, { status: 500 });
  }
}
