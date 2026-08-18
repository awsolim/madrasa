import { SignupPage } from "@/components/pages/auth-pages";
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
  return <SignupPage slug={slug} returnTo={safeReturnTo(query.returnTo, slug)} />;
}
