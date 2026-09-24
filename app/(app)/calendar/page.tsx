import { getCalendarEvents } from "@/lib/queries";
import { currentMonthIso } from "@/lib/calendar";
import { PageHeader } from "@/app/(app)/page-header";
import { CalendarView } from "./calendar-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const monthIso = month && /^\d{4}-\d{2}$/.test(month) ? month : currentMonthIso();
  const events = await getCalendarEvents();

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Shared with the whole household — anything either of you adds shows up for both." />
      <CalendarView events={events} monthIso={monthIso} />
    </div>
  );
}
