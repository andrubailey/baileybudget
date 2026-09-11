import { PageHeader } from "@/app/(app)/page-header";
import { ReportsBody } from "@/app/(app)/reports/reports-body";
import { SpendingTabs } from "../spending-tabs";

export default async function SpendingReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const { tab, range } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spending"
        description="Cash flow, spending, income, and transfers over time."
      />
      <SpendingTabs />
      <ReportsBody basePath="/spending/reports" searchTab={tab} searchRange={range} />
    </div>
  );
}
