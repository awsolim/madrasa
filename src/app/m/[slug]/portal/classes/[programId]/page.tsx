import { PortalProgramDetailPage } from "@/components/pages/portal-pages";

export default async function Page({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  return <PortalProgramDetailPage slug={slug} programId={programId} />;
}
