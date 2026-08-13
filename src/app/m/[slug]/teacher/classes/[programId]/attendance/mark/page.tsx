import { TeacherProgramMarkAttendancePage } from "@/components/pages/attendance-pages";

export default async function Page({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  return <TeacherProgramMarkAttendancePage slug={slug} programId={programId} />;
}
