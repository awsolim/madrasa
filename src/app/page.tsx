import { redirect } from "next/navigation";

// Single-tenant mode: Tareeqah currently only serves Assiddiq, so go straight
// into its mosque workspace. Revisit this when there is more than one client
// masjid on the platform.
const DEFAULT_MOSQUE_SLUG = "assiddiq";

export default function Page() {
  redirect(`/m/${DEFAULT_MOSQUE_SLUG}`);
}
