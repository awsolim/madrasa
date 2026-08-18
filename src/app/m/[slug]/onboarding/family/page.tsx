import { FamilyOnboardingPage } from "@/components/pages/onboarding-pages";
import { safeReturnTo } from "@/lib/authz";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  return <FamilyOnboardingPage slug={slug} returnTo={safeReturnTo(query.returnTo, slug)} />;
}
