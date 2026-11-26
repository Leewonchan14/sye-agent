"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CoupleView } from "@/components/calendar/couple-view";
import { DaySheet } from "@/components/calendar/day-sheet";
import { DiaryEditor } from "@/components/calendar/diary-editor";
import { EventDialog } from "@/components/calendar/event-dialog";
import { MonthView } from "@/components/calendar/month-view";
import { SearchPanel } from "@/components/calendar/search-panel";
import { SettingsDialog } from "@/components/calendar/settings-dialog";
import { TwoWeekView } from "@/components/calendar/two-week-view";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import {
  CALENDAR_LIVE_QUERY,
  calendarKeys,
  calendarRequest,
} from "@/lib/calendar/client";
import { useCalendarSettings } from "@/lib/calendar/hooks";
import type {
  CalendarOccurrence,
  CalendarPayload,
  CalendarView,
} from "@/lib/calendar/types";
import { DEFAULT_CALENDAR_SETTINGS, todayKst } from "@/lib/calendar/view";
import { kst } from "@/lib/kst";

const anchorRange = (
  view: CalendarView,
  anchorDate: string,
  weekStart: 0 | 1 = 0
): { from: string; to: string } => {
  if (view === "twoweek") {
    // 2주 격자의 열이 요일과 맞도록 anchor가 속한 주의 시작(일/월)에서 14일을 센다.
    const anchor = kst(anchorDate).startOf("day");
    const offset = (anchor.day() - weekStart + 7) % 7;
    const start = anchor.subtract(offset, "day");
    return {
      from: start.format("YYYY-MM-DD"),
      to: start.add(13, "day").format("YYYY-MM-DD"),
    };
  }
  const start = kst(anchorDate).startOf("month");
  return {
    from: start.format("YYYY-MM-DD"),
    to: start.endOf("month").format("YYYY-MM-DD"),
  };
};

const shiftAnchor = (view: CalendarView, anchorDate: string, delta: number): string => {
  if (view === "twoweek") {
    return kst(anchorDate)
      .add(delta * 14, "day")
      .format("YYYY-MM-DD");
  }
  return kst(anchorDate).add(delta, "month").format("YYYY-MM-DD");
};

const titleOf = (
  view: CalendarView,
  from: string,
  to: string,
  anchorDate: string
): string => {
  if (view === "twoweek") {
    return `${kst(from).format("M월 D일")} – ${kst(to).format("M월 D일")}`;
  }
  return kst(anchorDate).format("YYYY년 M월");
};

export const CalendarPage = () => {
  const token = useAuthStore((s) => s.token);
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState<string>(todayKst);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventState, setEventState] = useState<{
    event: CalendarOccurrence | null;
    initialDate?: string;
  }>({ event: null });
  const [eventOpen, setEventOpen] = useState(false);
  const [diaryDate, setDiaryDate] = useState<string | null>(null);

  // 2주 격자의 열이 요일과 맞도록 범위를 잡기 전에 시작 요일을 읽는다.
  const settingsQuery = useCalendarSettings();
  const weekStart = settingsQuery.data?.weekStart ?? 0;

  const { from, to } = anchorRange(view, anchorDate, weekStart);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: calendarKeys.range(from, to),
    queryFn: () =>
      calendarRequest<CalendarPayload>(token, `/api/calendar?from=${from}&to=${to}`),
    enabled: Boolean(token),
    ...CALENDAR_LIVE_QUERY,
  });

  const openNewEvent = (initialDate?: string) => {
    setEventState({ event: null, initialDate });
    setEventOpen(true);
  };

  const openEditEvent = (event: CalendarOccurrence) => {
    setEventState({ event, initialDate: undefined });
    setEventOpen(true);
  };

  const title = titleOf(view, from, to, anchorDate);
  const settings = data?.settings ?? settingsQuery.data ?? DEFAULT_CALENDAR_SETTINGS;
  const labels = data?.labels ?? [];

  return (
    <SidebarLayout activeNav="calendar">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-8 md:py-8">
        <CalendarHeader
          title={title}
          month={anchorDate.slice(0, 7)}
          view={view}
          onPrev={() => setAnchorDate((d) => shiftAnchor(view, d, -1))}
          onNext={() => setAnchorDate((d) => shiftAnchor(view, d, 1))}
          onToday={() => setAnchorDate(todayKst())}
          onViewChange={setView}
          onMonthChange={(month) => setAnchorDate(`${month}-01`)}
          onSearch={() => setSearchOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />

        <div className="mt-5">
          {isLoading ? (
            <div className="grid place-items-center rounded-2xl border border-hairline bg-surface py-16">
              <Spinner className="text-primary" />
            </div>
          ) : isError || !data ? (
            <div className="rounded-2xl border border-hairline bg-surface px-6 py-12 text-center">
              <p className="text-sm font-medium text-ink">캘린더를 불러오지 못했어요</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetch()}
              >
                다시 시도
              </Button>
            </div>
          ) : view === "month" ? (
            <MonthView
              days={data.days}
              events={data.events}
              diaries={data.diaries}
              labels={data.labels}
              settings={data.settings}
              selectedDate={selectedDate}
              onSelectDay={setSelectedDate}
            />
          ) : view === "twoweek" ? (
            <TwoWeekView
              days={data.days}
              events={data.events}
              diaries={data.diaries}
              labels={data.labels}
              settings={data.settings}
              selectedDate={selectedDate}
              onSelectDay={setSelectedDate}
            />
          ) : (
            <CoupleView events={data.events} labels={data.labels} />
          )}
        </div>
      </main>

      <DaySheet
        date={selectedDate}
        open={selectedDate !== null && diaryDate === null}
        onOpenChange={(open) => {
          if (!open) setSelectedDate(null);
        }}
        settings={settings}
        labels={labels}
        onEditEvent={openEditEvent}
        onAddEvent={(date) => openNewEvent(date)}
        onOpenDiary={(date) => setDiaryDate(date)}
      />

      <EventDialog
        open={eventOpen}
        onOpenChange={setEventOpen}
        settings={settings}
        labels={labels}
        initialDate={eventState.initialDate}
        event={eventState.event}
      />

      <DiaryEditor
        open={diaryDate !== null}
        onOpenChange={(open) => {
          if (!open) setDiaryDate(null);
        }}
        date={diaryDate ?? ""}
      />

      <SearchPanel
        open={searchOpen}
        onOpenChange={setSearchOpen}
        labels={labels}
        onSelectDate={(date) => setSelectedDate(date)}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarLayout>
  );
};
