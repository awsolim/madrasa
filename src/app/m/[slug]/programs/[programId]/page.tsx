import { PublicProgramDetailPage } from "@/components/pages/public-pages";
import { safeReturnTo } from "@/lib/authz";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { slug, programId } = await params;
  const query = await searchParams;
  return <PublicProgramDetailPage slug={slug} programId={programId} returnTo={safeReturnTo(query.returnTo, slug)} />;
}
