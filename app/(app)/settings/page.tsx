import { listApiTokens } from "@/app/actions";
import { ApiTokensSection } from "./api-tokens-section";

export default async function SettingsPage() {
  const tokens = await listApiTokens();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Access tokens and integrations.</p>
      </div>

      <ApiTokensSection tokens={tokens} />
    </div>
  );
}
