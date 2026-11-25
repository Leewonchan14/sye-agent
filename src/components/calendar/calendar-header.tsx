"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { FilterMenu, type CalendarFilter } from "@/components/calendar/filter-menu";
import { Button } from "@/components/ui/button";
import { VIEWER_NAME } from "@/lib/calendar/format";
import type { CalendarView, CalendarViewer } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
  { id: "month", label: "월간" },
  { id: "twoweek", label: "2주" },
  { id: "couple", label: "커플" },
  { id: "diary", label: "일기" },
];

const VIEWERS: CalendarViewer[] = ["wonchan", "yeeun"];

export const CalendarHeader = ({
  title,
  view,
  viewer,
  filter,
  onFilterChange,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onViewerChange,
  onSearch,
  onSettings,
}: {
  title: string;
  view: CalendarView;
  viewer: CalendarViewer;
  filter: CalendarFilter;
  onFilterChange: (filter: CalendarFilter) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onViewerChange: (viewer: CalendarViewer) => void;
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
          <span
            data-testid="calendar-title"
            className="min-w-32 text-center text-[15px] font-semibold text-ink tabular-nums"
          >
            {title}
          </span>
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
        <div
          role="group"
          aria-label="보는 사람"
          className="flex items-center rounded-lg border border-hairline bg-surface p-0.5"
        >
          {VIEWERS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={viewer === v}
              onClick={() => onViewerChange(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                viewer === v && "bg-primary text-primary-foreground",
                viewer !== v && "text-muted hover:text-ink"
              )}
            >
              {VIEWER_NAME[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="보기 방식"
          className="flex items-center rounded-lg border border-hairline bg-surface p-0.5"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              data-testid={`view-tab-${option.id}`}
              onClick={() => onViewChange(option.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                view === option.id && "bg-primary text-primary-foreground",
                view !== option.id && "text-muted hover:text-ink"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <FilterMenu filter={filter} onChange={onFilterChange} />
      </div>
    </header>
  );
};
