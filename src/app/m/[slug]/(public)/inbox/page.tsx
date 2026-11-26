import { GuestAccountPage } from "@/components/pages/guest-account-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GuestAccountPage slug={slug} tab="inbox" />;
}
