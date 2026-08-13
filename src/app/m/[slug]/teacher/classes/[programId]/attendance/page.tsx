import { TeacherProgramAttendancePage } from "@/components/pages/attendance-pages";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string; programId: string }>; searchParams: Promise<{ returnTo?: string; from?: string }> }) {
  const { slug, programId } = await params;
  const query = await searchParams;
  return <TeacherProgramAttendancePage slug={slug} programId={programId} returnTo={query.returnTo} from={query.from} />;
}
