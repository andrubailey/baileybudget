import { redirect } from "next/navigation";

// The standalone Budget page was folded into Spending → Breakdown & budget.
// Kept as a redirect so bookmarks and old links land on the editor.
export default function BudgetsPage() {
  redirect("/spending/breakdown?edit=1");
}
