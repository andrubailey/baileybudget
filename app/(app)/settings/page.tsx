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
      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
