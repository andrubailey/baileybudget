import { redirect } from "next/navigation";

// Goals moved onto the Overview page as a compact card under the weekly
// recap. Kept as a redirect so bookmarks still land somewhere useful.
export default function GoalsPage() {
  redirect("/");
}
