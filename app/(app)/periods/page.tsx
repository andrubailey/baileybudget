import { getPeriods } from "@/lib/periods";
import { createPeriod } from "@/app/actions";

export default async function PeriodsPage() {
  const periods = await getPeriods();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Periods</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Create a period (usually a month) before adding a budget or
          transactions for it.
        </p>
      </div>

      <form
        action={createPeriod}
        className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 sm:grid-cols-3 dark:border-white/10"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium">Name</label>
          <input
            name="name"
            required
            placeholder="September 2026"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Start date</label>
          <input
            type="date"
            name="start_date"
            required
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">End date</label>
          <input
            type="date"
            name="end_date"
            required
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/15"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Add period
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Start</th>
              <th className="px-4 py-2 font-medium">End</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.start_date}</td>
                <td className="px-4 py-2">{p.end_date}</td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                  No periods yet — add your first month above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
