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

## Deploying

Push this repo to GitHub, then import it on [Vercel](https://vercel.com/new). Add the two env vars from `.env.local` in the Vercel project settings. Every push to `main` redeploys automatically.

## Data model

- **accounts** — bank accounts/cards, with a starting balance and optional savings goal. Current balance is computed from starting balance + all transactions.
- **periods** — budgeting periods, typically months.
- **categories** — income or expense categories; expense categories can be flagged as a "need".
- **budget_lines** — the planned amount for one category in one period.
- **transactions** — income or expense entries, tied to an account, category, and period, with free-form tags.

Row-level security allows any authenticated user full read/write access — this is a 2-person shared household budget, not a multi-tenant app.
