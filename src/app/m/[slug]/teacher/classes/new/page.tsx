import { TeacherProgramCreatePage } from "@/components/pages/teacher-pages";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TeacherProgramCreatePage slug={slug} />;
}
