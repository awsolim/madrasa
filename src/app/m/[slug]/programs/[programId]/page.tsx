import { PublicProgramDetailPage } from "@/components/pages/public-pages";
import { safeReturnTo } from "@/lib/authz";
import { resolvePublicProgramId } from "@/lib/programs/resolve-public-link";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { slug, programId } = await params;
  const query = await searchParams;
  const id = await resolvePublicProgramId(slug, programId);
  return <PublicProgramDetailPage slug={slug} programId={id} returnTo={safeReturnTo(query.returnTo, slug)} />;
}
