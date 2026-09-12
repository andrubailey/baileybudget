import { redirect } from "next/navigation";

// The standalone Breakdown page was merged into the Spending overview
// (which now renders the same BreakdownPanel/side-cards this folder's
// components still provide). Kept as a redirect so bookmarks and old links
// land in the right place, carrying over `?period=` if it was set.
export default async function SpendingBreakdownRedirect({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  redirect(period ? `/spending?period=${period}` : "/spending");
}
