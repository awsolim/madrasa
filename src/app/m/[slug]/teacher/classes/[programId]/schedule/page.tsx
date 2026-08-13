import { TeacherSchedulePage } from "@/components/pages/teacher-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; programId: string }>;
}) {
  const { slug, programId } = await params;
  return <TeacherSchedulePage slug={slug} programId={programId} />;
}
