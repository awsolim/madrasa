import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ParentChildProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email" | "phone_number" | "avatar_url" | "age" | "gender" | "date_of_birth" | "account_type"
>;

export async function fetchParentChildren(
  supabase: SupabaseClient<Database>,
  slug: string,
  parentId: string,
  knownMosqueId?: string,
) {
  let mosqueId = knownMosqueId ?? null;
  if (!mosqueId) {
    const { data: mosque } = await supabase.from("mosques").select("id").eq("slug", slug).maybeSingle();
    mosqueId = mosque?.id ?? null;
  }

  if (!mosqueId) {
    return { mosqueId: null, children: [] as ParentChildProfile[] };
  }

  const { data: links } = await supabase
    .from("parent_child_links")
    .select("child_profile_id")
    .eq("parent_profile_id", parentId)
    .eq("mosque_id", mosqueId);

  const childIds = (links ?? []).map((link) => link.child_profile_id);
  if (childIds.length === 0) {
    return { mosqueId, children: [] as ParentChildProfile[] };
  }

  const { data: children } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone_number, avatar_url, age, gender, date_of_birth, account_type")
    .in("id", childIds);

  return { mosqueId, children: (children ?? []) as ParentChildProfile[] };
}
