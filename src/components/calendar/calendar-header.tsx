"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Segmented } from "@/components/calendar/calendar-ui";
import { MonthPicker } from "@/components/ledger/period-picker";
import { Button } from "@/components/ui/button";
import type { CalendarView } from "@/lib/calendar/types";

const VIEW_OPTIONS: { value: CalendarView; label: string; testId: string }[] = [
  { value: "month", label: "월간", testId: "view-tab-month" },
  { value: "twoweek", label: "2주", testId: "view-tab-twoweek" },
  { value: "couple", label: "커플", testId: "view-tab-couple" },
];

export const CalendarHeader = ({
  title,
  month,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onMonthChange,
  onSearch,
  onSettings,
}: {
  title: string;
  /** YYYY-MM */
  month: string;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onMonthChange: (month: string) => void;
  onSearch: () => void;
  onSettings: () => void;
}) => {
  const isTwoweek = view === "twoweek";
  const prevLabel = isTwoweek ? "이전 2주" : "이전 달";
  const nextLabel = isTwoweek ? "다음 2주" : "다음 달";

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-canvas-card text-primary">
            <CalendarDays className="size-4" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">우리 캘린더</h1>
            <p className="mt-0.5 text-[13px] text-muted">원찬이와 예은이의 캘린더</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="일정 검색"
            onClick={onSearch}
          >
            <Search />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="캘린더 설정"
            onClick={onSettings}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={prevLabel}
            onClick={onPrev}
          >
            <ChevronLeft />
          </Button>
          <div
            data-testid="calendar-title"
            className="min-w-32 text-center text-[15px] font-semibold text-ink tabular-nums"
          >
            {view === "month" ? (
              <MonthPicker month={month} onChange={onMonthChange} />
            ) : (
              title
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={nextLabel}
            onClick={onNext}
          >
            <ChevronRight />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onToday}>
            오늘
          </Button>
        </div>
      </div>

      <Segmented
        ariaLabel="보기 방식"
        options={VIEW_OPTIONS}
        value={view}
        onChange={onViewChange}
        className="self-start bg-surface"
      />
    </header>
  );
};
