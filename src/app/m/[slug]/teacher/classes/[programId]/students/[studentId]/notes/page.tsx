import { TeacherStudentNotesPage } from "@/components/pages/teacher-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; programId: string; studentId: string }>;
}) {
  const { slug, programId, studentId } = await params;
  return <TeacherStudentNotesPage slug={slug} programId={programId} studentId={studentId} />;
}
