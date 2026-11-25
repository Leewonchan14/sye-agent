import { DiaryPages } from "@/components/calendar/diary-pages";
import { SidebarLayout } from "@/components/sidebar-layout";

export default function Page() {
  return (
    <SidebarLayout activeNav="calendar">
      <DiaryPages />
    </SidebarLayout>
  );
}
