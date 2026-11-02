import { notFound } from "next/navigation";
import { UiKit } from "./ui-kit";

// Development-only showcase of components/ui, reachable without signing in
// (see lib/supabase/middleware.ts) so the shell can be checked on a phone
// or simulator. 404s in production.
export default function UiKitPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiKit />;
}
