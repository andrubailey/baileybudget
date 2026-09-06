import { getAccountsWithBalances, getCategories } from "@/lib/queries";
import { CsvImport } from "./csv-import";

export default async function ImportPage() {
  const [accounts, categories] = await Promise.all([
    getAccountsWithBalances(),
    getCategories(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Import Transactions</h1>
        <p className="mt-1 text-sm text-text-muted">
          Upload a CSV export from your bank to bulk-add transactions instead of entering them one by one.
        </p>
      </div>

      <CsvImport accounts={accounts} categories={categories} />
    </div>
  );
}
