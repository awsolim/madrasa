import { ProgramApplyPage } from "@/components/pages/public-pages";
import { resolvePublicProgramId } from "@/lib/programs/resolve-public-link";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; programId: string }>;
}) {
  const { slug, programId } = await params;
  return <ProgramApplyPage slug={slug} programId={await resolvePublicProgramId(slug, programId)} />;
}
