"use server";

import { getCategoryHistory, type CategoryMonthSpend } from "@/lib/queries";

// Loaded on demand when a category's detail panel opens, rather than
// fetching six months of history for every category on every dashboard load.
export async function fetchCategoryHistory(
  categoryId: string,
): Promise<CategoryMonthSpend[]> {
  return getCategoryHistory(categoryId, 6);
}
