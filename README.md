# Household Budget

A shared budgeting app for two people, mirroring a monthly zero-based-budget
structure: accounts, periods (months), categories with planned amounts, and
income/expense transactions.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is plenty).
2. In the Supabase SQL editor, run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This creates all tables and row-level security policies.
3. Copy `.env.local.example` to `.env.local` and fill in your project's URL and anon key (Project Settings → API):
   ```bash
   cp .env.local.example .env.local
   ```
4. Create the two accounts that should have access — Authentication → Users → Invite user, in the Supabase dashboard, for yourself and your wife. There's no public sign-up page by design.
5. Install dependencies and run the dev server:
   ```bash
   npm install
   npm run dev
   ```
6. Open [http://localhost:3000](http://localhost:3000), sign in, and create your first period from the **Periods** page — everything else (accounts, categories, transactions) is scoped to a period.

## Importing from Notion

If you were tracking expenses in a Notion "Ultimate Budget"-style template, `scripts/migrate-notion.mjs` does a one-time import of accounts, periods, expense categories, and expense transactions straight from Notion into Supabase.

1. Create a Notion internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration** → copy its **Internal Integration Secret**.
2. Open your Notion Finances page → **···** menu → **Connections** → add the integration you just created, so it can read the Accounts / Time Periods / Budget / Expenses databases.
3. In Supabase, go to **Settings → API** and copy the **service_role** secret key (this bypasses row-level security — keep it out of `.env.local` / git, only use it for this one-off run).
4. Run:
   ```bash
   NOTION_TOKEN=secret_xxx \
   SUPABASE_URL=https://your-project.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   npm run migrate:notion
   ```

It dedupes Notion's per-month category rows (e.g. "Groceries - AUG26") into one category per name and skips blank/corrupt rows. Safe to re-run against a fresh database, but running it twice against the same database will duplicate everything (there's no dedupe on re-run).

Then import income the same way — it matches existing accounts/periods by name instead of re-creating them, so it's safe to run any time after the step above:

```bash
NOTION_TOKEN=secret_xxx \
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run migrate:notion-income
```

## Deploying

Push this repo to GitHub, then import it on [Vercel](https://vercel.com/new). Add the two env vars from `.env.local` in the Vercel project settings. Every push to `main` redeploys automatically.

## Data model

- **accounts** — bank accounts/cards, with a starting balance and optional savings goal. Current balance is computed from starting balance + all transactions.
- **periods** — budgeting periods, typically months.
- **categories** — income or expense categories; expense categories can be flagged as a "need".
- **budget_lines** — the planned amount for one category in one period.
- **transactions** — income or expense entries, tied to an account, category, and period, with free-form tags.

Row-level security allows any authenticated user full read/write access — this is a 2-person shared household budget, not a multi-tenant app.
