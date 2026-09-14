import Link from "next/link";
import { listApiTokens } from "@/app/actions";
import { PageHeader } from "@/app/(app)/page-header";
import { ApiTokensSection } from "./api-tokens-section";
import { ThemeToggle } from "./theme-toggle";

export default async function SettingsPage() {
  const tokens = await listApiTokens();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Appearance, access tokens, and integrations." />

      <ThemeToggle />

      {/* The recap alert (see WeeklyRecapAlert) only ever surfaces itself
          once, in the top bar, and disappears for good once reviewed —
          `?recap=1` is its own escape hatch for reopening this week's, but
          nothing links to it. This is that link. */}
      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">This week&apos;s recap</p>
          <p className="text-metadata mt-0.5">Reopen it even if you&apos;ve already reviewed it.</p>
        </div>
        <Link
          href="/settings?recap=1"
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg"
        >
          View recap
        </Link>
      </div>

      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
