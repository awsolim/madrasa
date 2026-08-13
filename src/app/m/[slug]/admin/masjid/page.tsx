import { AdminMasjidPage } from "@/components/pages/admin-pages";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AdminMasjidPage slug={slug} />;
}
