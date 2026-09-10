import { getAccountsWithBalances, getObjectives } from "@/lib/queries";
import { PageHeader } from "@/app/(app)/page-header";
import { ObjectivesSection } from "@/app/(app)/objectives-section";

export default async function GoalsPage() {
  const [objectives, accounts] = await Promise.all([getObjectives(), getAccountsWithBalances()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="Savings targets, payoff milestones, and other financial objectives."
      />

      <ObjectivesSection objectives={objectives} accounts={accounts} />
    </div>
  );
}
