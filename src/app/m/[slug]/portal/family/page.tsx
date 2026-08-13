import { PortalFamilyPage } from "@/components/pages/portal-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PortalFamilyPage slug={slug} />;
}
