import { getAccountsWithBalances, getObjectives } from "@/lib/queries";
import { ObjectivesSection } from "@/app/(app)/objectives-section";

export default async function GoalsPage() {
  const [objectives, accounts] = await Promise.all([getObjectives(), getAccountsWithBalances()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-text sm:text-display">Goals</h1>
        <p className="mt-1 text-sm text-text-muted">
          Savings targets, payoff milestones, and other financial objectives.
        </p>
      </div>

      <ObjectivesSection objectives={objectives} accounts={accounts} />
    </div>
  );
}
