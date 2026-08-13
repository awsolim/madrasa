import { PublicMasjidPage } from "@/components/pages/public-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicMasjidPage slug={slug} />;
}
