import { ProgramPreviewShell } from "@/components/auth/program-preview-shell";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProgramPreviewShell slug={slug}>{children}</ProgramPreviewShell>;
}
