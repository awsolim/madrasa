import { AdminProgramMarkAttendancePage } from "@/components/pages/attendance-pages";

export default async function Page({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  return <AdminProgramMarkAttendancePage slug={slug} programId={programId} />;
}
