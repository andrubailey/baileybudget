import { getAccounts, getAllTransactions, getCategories } from "@/lib/queries";
import { getHouseholdMembers } from "@/lib/profile";
import { PageHeader } from "@/components/ui";
import { EmptyState } from "@/app/(app)/empty-state";
import { ActivityList } from "./activity-list";

// How far back the mobile Activity list reaches. Deep enough that "this month"
// and "logged by" always have everything they need, shallow enough that the
// page doesn't ship a year of rows to a phone. The full history, with real
// searching and bulk edits, is the desktop /transactions page.
const MAX_ROWS = 250;

// The mobile Activity tab: reverse chronological, grouped by day, tap a row to
// fix it in place. Not scoped to a single period the way it used to be — an
// entry logged on the 1st for the 30th of last month is exactly the kind of
// thing this list exists to catch, and a month-bounded view hid it.
export default async function ActivityPage() {
  const [transactions, accounts, categories, members] = await Promise.all([
    getAllTransactions(),
    getAccounts(),
    getCategories(),
    getHouseholdMembers(),
  ]);

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title="Activity" />
        <EmptyState compact message="Nothing logged yet." />
      </>
    );
  }

  return (
    <ActivityList
      transactions={transactions.slice(0, MAX_ROWS)}
      accounts={accounts}
      categories={categories}
      members={members}
    />
  );
}
