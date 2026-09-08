"use client";

import { useState } from "react";
import { createApiToken, revokeApiToken, type ApiTokenSummary } from "@/app/actions";
import { formatDate } from "@/lib/format";

export function ApiTokensSection({ tokens }: { tokens: ApiTokenSummary[] }) {
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app-domain";

  async function handleCreate() {
    setIsPending(true);
    const token = await createApiToken(label || "Shortcuts token");
    setNewToken(token);
    setLabel("");
    setIsPending(false);
  }

  async function copyToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can still select the text manually
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-card">
      <div>
        <h2 className="text-heading text-text">iOS Shortcuts access</h2>
        <p className="mt-1 text-sm text-text-muted">
          Generate a token to let an iPhone Shortcut log transactions without opening the app or
          signing in. One token works for both of you.
        </p>
      </div>

      {newToken ? (
        <div className="space-y-2 rounded-lg border border-accent-border bg-accent-soft p-4">
          <p className="text-sm font-medium text-accent">
            Copy this now — it won&apos;t be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-surface px-3 py-2 text-xs text-text">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 rounded-md border border-accent-border bg-surface px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-bg"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="text-xs font-medium text-accent underline underline-offset-2"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={'Label (e.g. "Our phones")'}
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Generating…" : "Generate token"}
          </button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {tokens.map((t, i) => (
            <div
              key={t.id}
              style={{ animationDelay: `${i * 35}ms` }}
              className="animate-fade-in-up flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{t.label}</p>
                <p className="text-xs text-text-faint">
                  Created {formatDate(t.created_at.slice(0, 10))}
                  {t.last_used_at ? ` · last used ${formatDate(t.last_used_at.slice(0, 10))}` : " · never used"}
                  {t.revoked_at ? " · revoked" : ""}
                </p>
              </div>
              {!t.revoked_at && (
                <button
                  type="button"
                  onClick={() => revokeApiToken(t.id)}
                  className="shrink-0 text-xs font-medium text-text-faint transition-colors hover:text-negative"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-border bg-bg p-4 text-sm text-text-muted">
        <summary className="cursor-pointer font-medium text-text">How to set up the Shortcut</summary>
        <div className="mt-3 space-y-2">
          <p>In the Shortcuts app, create a new shortcut and add these actions in order:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>&quot;Ask for Text&quot; — prompt: &quot;Description&quot;</li>
            <li>&quot;Ask for Text&quot; (Number) — prompt: &quot;Amount&quot;</li>
            <li>
              &quot;Get Contents of URL&quot;: URL <code>{origin}/api/shortcuts/transaction</code>,
              Method <strong>POST</strong>, Headers: <code>Authorization: Bearer YOUR_TOKEN</code>,
              Request Body (JSON):
              <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-xs">
{`{
  "kind": "expense",
  "description": [Description],
  "amount": [Amount],
  "account": "Personal Checking"
}`}
              </pre>
            </li>
            <li>&quot;Show Notification&quot; — text: &quot;Logged!&quot;</li>
          </ol>
          <p>
            Duplicate it for income (<code>&quot;kind&quot;: &quot;income&quot;</code>) and add each to your
            Home Screen or ask Siri (&quot;Hey Siri, add expense&quot;). <code>account</code> and
            <code> category</code> are optional and matched by name — leave them out to log without one.
          </p>

          <p className="pt-2 font-medium text-text">For a transfer between accounts:</p>
          <p>Same shape, but skip the description/amount category step — use two &quot;Ask for Text&quot; actions for the two account names instead, plus one for the amount:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>&quot;Ask for Text&quot; — prompt: &quot;From account&quot;</li>
            <li>&quot;Ask for Text&quot; — prompt: &quot;To account&quot;</li>
            <li>&quot;Ask for Text&quot; (Number) — prompt: &quot;Amount&quot;</li>
            <li>
              &quot;Get Contents of URL&quot;: same URL and headers as above, Request Body (JSON):
              <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-xs">
{`{
  "kind": "transfer",
  "description": "Transfer",
  "amount": [Amount],
  "account": [From account],
  "to_account": [To account]
}`}
              </pre>
            </li>
            <li>&quot;Show Notification&quot; — text: &quot;Transfer logged!&quot;</li>
          </ol>
          <p>
            <code>account</code>/<code>to_account</code> must be two different account names —
            the endpoint rejects the request otherwise.
          </p>
        </div>
      </details>
    </div>
  );
}
