import { ProgramExportsPage } from "@/components/data/program-exports";

export default async function Page({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  return <ProgramExportsPage slug={slug} programId={programId} mode="admin" />;
}
