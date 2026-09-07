"use client";

import { useState } from "react";
import { bulkImportTransactions } from "@/app/actions";
import type { CsvImportRow } from "@/app/actions";
import type { Account, Category } from "@/lib/types";
import { cleanMerchantDescription } from "@/lib/merchant-name";

// Minimal CSV parser: handles quoted fields (with embedded commas) and
// strips a trailing carriage return from Windows-exported files.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

// Parses common date formats (YYYY-MM-DD, MM/DD/YYYY) into YYYY-MM-DD.
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function CsvImport({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [result, setResult] = useState<{ imported: number; skippedNoPeriod: number } | null>(null);
  const [isPending, setIsPending] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ""));
      if (parsed.length === 0) return;
      const [header, ...body] = parsed;
      setHeaders(header);
      setRows(body);
      const guess = (needle: string) =>
        header.find((h) => h.toLowerCase().includes(needle)) ?? "";
      setDateCol(guess("date"));
      setDescCol(guess("desc") || guess("name") || guess("merchant"));
      setAmountCol(guess("amount"));
    };
    reader.readAsText(file);
  }

  const dateIdx = headers.indexOf(dateCol);
  const descIdx = headers.indexOf(descCol);
  const amountIdx = headers.indexOf(amountCol);
  const ready = dateIdx !== -1 && descIdx !== -1 && amountIdx !== -1 && accountId;

  const previewRows = rows.slice(0, 5);

  async function handleImport() {
    if (!ready) return;
    const accountName = accounts.find((a) => a.id === accountId)?.name ?? "the selected account";
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? "no default category";
    const confirmed = window.confirm(
      `Import ${rows.length} transactions into ${accountName} (${categoryName})? This adds them to the shared dataset immediately — review the preview above before confirming.`,
    );
    if (!confirmed) return;
    setIsPending(true);
    const parsedRows: CsvImportRow[] = [];
    for (const r of rows) {
      const date = normalizeDate(r[dateIdx] ?? "");
      const amount = Number((r[amountIdx] ?? "").replace(/[^0-9.-]/g, ""));
      const description = (r[descIdx] ?? "").trim();
      if (!date || !description || Number.isNaN(amount) || amount === 0) continue;
      parsedRows.push({
        description,
        amount,
        txn_date: date,
        account_id: accountId,
        category_id: categoryId || null,
      });
    }
    const outcome = await bulkImportTransactions(parsedRows);
    setResult(outcome);
    setIsPending(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
        <label className="text-sm font-medium text-text">Bank statement CSV</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="mt-2 block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
        />
      </div>

      {headers.length > 0 && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-card">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ColumnSelect label="Date column" value={dateCol} onChange={setDateCol} options={headers} />
            <ColumnSelect label="Description column" value={descCol} onChange={setDescCol} options={headers} />
            <ColumnSelect
              label="Amount column"
              value={amountCol}
              onChange={setAmountCol}
              options={headers}
              hint="Negative = expense, positive = income"
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Import into account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text">Default category (optional)</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-1.5 text-xs font-medium text-text-muted">
                        {h}
                      </th>
                    ))}
                    {descIdx !== -1 && (
                      <th className="px-3 py-1.5 text-xs font-medium text-text-muted">
                        Will be logged as
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      {r.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-text-muted">
                          {cell}
                        </td>
                      ))}
                      {descIdx !== -1 && (
                        <td className="px-3 py-1.5 font-medium text-text">
                          {cleanMerchantDescription(r[descIdx] ?? "")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-text-faint">{rows.length} rows detected.</p>

          {ready && (
            <p className="text-sm text-text-muted">
              About to add <span className="font-medium text-text">{rows.length}</span>{" "}
              transactions to{" "}
              <span className="font-medium text-text">
                {accounts.find((a) => a.id === accountId)?.name}
              </span>
              {categoryId && (
                <>
                  {" "}
                  as{" "}
                  <span className="font-medium text-text">
                    {categories.find((c) => c.id === categoryId)?.name}
                  </span>
                </>
              )}
              . This is shared, immediate data — nothing is staged.
            </p>
          )}

          <button
            type="button"
            disabled={!ready || isPending}
            onClick={handleImport}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Importing…" : `Import ${rows.length} transactions`}
          </button>

          {result && (
            <p className="text-sm text-text-muted">
              Imported {result.imported} transactions.
              {result.skippedNoPeriod > 0 &&
                ` Skipped ${result.skippedNoPeriod} outside any existing month — those months haven't been created yet.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-text">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
      >
        <option value="">Select column…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
    </div>
  );
}
