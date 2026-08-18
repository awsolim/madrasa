import { ProgramApplyPage } from "@/components/pages/public-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; programId: string }>;
}) {
  const { slug, programId } = await params;
  return <ProgramApplyPage slug={slug} programId={programId} />;
}
