import { FinanceAuditTrail } from "@/components/data/finance-audit-trail";
import { PageTitleBar } from "@/components/layout/page-title-bar";

export default async function Page({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  return <><PageTitleBar title="Audit Trail" backHref={`/m/${slug}/admin/programs/${programId}/finances`} backLabel="Finances" tone="teal" /><FinanceAuditTrail programId={programId} /></>;
}
