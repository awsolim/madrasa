import { ForgotPasswordPage } from "@/components/pages/auth-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ForgotPasswordPage slug={slug} />;
}
