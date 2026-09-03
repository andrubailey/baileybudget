import { getPeriods } from "@/lib/periods";
import { createPeriod } from "@/app/actions";

export default async function PeriodsPage() {
  const periods = await getPeriods();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Periods</h1>
        <p className="mt-1 text-sm text-text-muted">
          Create a period (usually a month) before adding a budget or
          transactions for it.
        </p>
      </div>

      <form
        action={createPeriod}
        className="grid max-w-xl grid-cols-1 gap-4 rounded-xl border border-border bg-surface p-6 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] sm:grid-cols-3"
      >
        <div className="space-y-1.5 sm:col-span-1">
          <label className="text-sm font-medium text-text">Name</label>
          <input
            name="name"
            required
            placeholder="September 2026"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Start date</label>
          <input
            type="date"
            name="start_date"
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">End date</label>
          <input
            type="date"
            name="end_date"
            required
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Add period
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-bg">
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Name</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">Start</th>
              <th className="px-6 py-2 text-xs font-medium text-text-muted">End</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-b-0">
                <td className="px-6 py-3 text-sm font-medium text-text">{p.name}</td>
                <td className="px-6 py-3 text-sm text-text-muted">{p.start_date}</td>
                <td className="px-6 py-3 text-sm text-text-muted">{p.end_date}</td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-sm text-text-muted">
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
