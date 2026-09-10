import { listApiTokens } from "@/app/actions";
import { PageHeader } from "@/app/(app)/page-header";
import { ApiTokensSection } from "./api-tokens-section";

export default async function SettingsPage() {
  const tokens = await listApiTokens();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Access tokens and integrations." />

      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
