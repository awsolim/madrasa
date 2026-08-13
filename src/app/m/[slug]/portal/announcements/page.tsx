import { PortalAnnouncementsPage } from "@/components/pages/portal-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PortalAnnouncementsPage slug={slug} />;
}
