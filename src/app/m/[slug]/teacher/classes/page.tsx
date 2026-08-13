import { TeacherClassesPage } from "@/components/pages/teacher-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <TeacherClassesPage slug={slug} />;
}
