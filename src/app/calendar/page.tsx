import { Suspense } from "react";

import { CalendarPage } from "@/components/calendar/calendar-page";

export default function Page() {
  return (
    <Suspense>
      <CalendarPage />
    </Suspense>
  );
}
