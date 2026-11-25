"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import {
  DayNumber,
  DiaryMark,
  LabelDot,
  WeekdayHeader,
} from "@/components/calendar/calendar-ui";
import type {
  CalendarDayInfo,
  CalendarDiarySummary,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import {
  dateColorClass,
  eventTimeText,
  groupEventsByDate,
  labelColorResolver,
  todayKst,
  weekdayColumn,
  weekdayLabels,
} from "@/lib/calendar/view";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

/** 격자 칸에 보여 줄 일정 수. 넘치면 +N. */
const MAX_VISIBLE = 4;

type DayRowProps = {
  day: CalendarDayInfo;
  dayEvents: CalendarOccurrence[];
  settings: CalendarSettings;
  isToday: boolean;
  isSelected: boolean;
  hasDiary: boolean;
  colorOf: (labelId: number | null) => string;
  onSelect: () => void;
};

const dayAriaLabel = (day: CalendarDayInfo, count: number, hasDiary: boolean) =>
  `${kst(day.date).format("M월 D일 dddd")}, 일정 ${count}개${hasDiary ? ", 일기 있음" : ""}`;

/** 폰: 하루 한 줄. 왼쪽에 날짜, 오른쪽에 그날 일정 전부. */
const DayListRow = ({
  day,
  dayEvents,
  settings,
  isToday,
  isSelected,
  hasDiary,
  colorOf,
  onSelect,
}: DayRowProps) => (
  <button
    type="button"
    data-testid={`two-week-day-${day.date}`}
    aria-label={dayAriaLabel(day, dayEvents.length, hasDiary)}
    onClick={onSelect}
    className={cn(
      "flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left transition-colors",
      isToday && "bg-primary/5",
      isSelected && "bg-canvas-card"
    )}
  >
    <div className="w-9 shrink-0 text-center">
      <div
        className={cn(
          "mx-auto grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums",
          dateColorClass(day, settings),
          isToday && "bg-primary text-primary-foreground"
        )}
      >
        {Number(day.date.slice(-2))}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-soft">
        {
          weekdayLabels(settings.weekStart)[
            weekdayColumn(day.weekday, settings.weekStart)
          ]
        }
      </div>
      {settings.lunarMonth && day.lunar && (
        <div className="mt-0.5 truncate text-[10px] text-muted-soft">
          {day.lunar.label}
        </div>
      )}
      {hasDiary && <DiaryMark className="mx-auto mt-1" />}
    </div>
    <div className="min-w-0 flex-1 space-y-1 pt-0.5">
      {settings.showHolidays && day.holiday && (
        <div className="truncate text-[11px] font-medium text-error">{day.holiday}</div>
      )}
      {dayEvents.length === 0 && (
        <div className="pt-0.5 text-[11px] leading-6 text-muted-soft">일정 없음</div>
      )}
      {dayEvents.map((event) => (
        <div
          key={event.occurrenceKey}
          className="flex min-w-0 items-center gap-1.5 text-[12px]"
        >
          <LabelDot color={colorOf(event.labelId)} />
          <span className="truncate text-body">{event.title}</span>
          {event.owner === "together" && (
            <Heart aria-hidden="true" className="size-3 shrink-0 text-primary" />
          )}
          <span className="ml-auto shrink-0 text-[11px] text-muted-soft tabular-nums">
            {eventTimeText(event)}
          </span>
        </div>
      ))}
    </div>
  </button>
);

/** md 이상: 7×2 격자의 한 칸. */
const DayGridCell = ({
  day,
  dayEvents,
  settings,
  isToday,
  isSelected,
  hasDiary,
  colorOf,
  onSelect,
}: DayRowProps) => {
  const overflow = dayEvents.length - MAX_VISIBLE;
  return (
    <button
      type="button"
      data-testid={`twoweek-cell-${day.date}`}
      aria-pressed={isSelected}
      aria-label={dayAriaLabel(day, dayEvents.length, hasDiary)}
      onClick={onSelect}
      className={cn(
        "flex min-h-40 flex-col items-start gap-0.5 overflow-hidden rounded-lg border border-hairline-soft/80 p-1.5 text-left transition-colors hover:bg-canvas-soft/70",
        isToday && "ring-1 ring-primary/40",
        isSelected &&
          "border-primary bg-canvas-card ring-1 ring-primary/50 hover:bg-canvas-card"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <DayNumber
          day={day}
          settings={settings}
          isToday={isToday}
          className="text-[13px] md:text-[14px]"
        />
        {hasDiary && <DiaryMark className="mr-auto ml-1" />}
        {settings.lunarMonth && day.lunar && (
          <span className="truncate text-[11px] text-muted-soft">{day.lunar.label}</span>
        )}
      </div>
      {settings.showHolidays && day.holiday && (
        <span className="w-full truncate text-[12px] leading-tight font-medium text-error">
          {day.holiday}
        </span>
      )}
      <div className="mt-1 w-full space-y-1">
        {dayEvents.slice(0, MAX_VISIBLE).map((event) => (
          <div
            key={event.occurrenceKey}
            className="flex min-w-0 items-start gap-1 text-[12px] leading-tight"
          >
            <LabelDot color={colorOf(event.labelId)} className="mt-0.5" />
            <span className="min-w-0 flex-1 truncate text-body">{event.title}</span>
            <span className="shrink-0 text-muted-soft tabular-nums">
              {eventTimeText(event)}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <span className="text-[11px] text-muted-soft tabular-nums">+{overflow}</span>
        )}
      </div>
    </button>
  );
};

/**
 * 2주 보기.
 *
 * 폰 폭(7칸 ≈ 55px)에서는 칸 안에 제목이 들어가지 않으므로 14일 세로 목록으로 보여 주고,
 * md 이상에서만 7×2 격자를 쓴다. 두 표현 모두 같은 날짜를 눌러 상세 시트를 연다.
 */
export const TwoWeekView = ({
  days,
  events,
  diaries,
  labels,
  settings,
  selectedDate,
  onSelectDay,
}: {
  days: CalendarDayInfo[];
  events: CalendarOccurrence[];
  diaries: CalendarDiarySummary[];
  labels: CalendarLabel[];
  settings: CalendarSettings;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) => {
  const today = todayKst();
  const eventsByDate = useMemo(() => groupEventsByDate(events, days), [events, days]);
  const colorOf = useMemo(() => labelColorResolver(labels), [labels]);
  const diaryDates = useMemo(
    () => new Set(diaries.map((diary) => diary.date)),
    [diaries]
  );

  const rowProps = (day: CalendarDayInfo): DayRowProps => ({
    day,
    dayEvents: eventsByDate.get(day.date) ?? [],
    settings,
    isToday: day.date === today,
    isSelected: day.date === selectedDate,
    hasDiary: diaryDates.has(day.date),
    colorOf,
    onSelect: () => onSelectDay(day.date),
  });

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
      <div
        data-testid="two-week-list"
        className="divide-y divide-hairline-soft md:hidden"
      >
        {days.map((day) => (
          <DayListRow key={day.date} {...rowProps(day)} />
        ))}
      </div>

      <div data-testid="two-week-grid" className="hidden grid-cols-7 gap-1 md:grid">
        <WeekdayHeader weekStart={settings.weekStart} />
        {days.map((day) => (
          <DayGridCell key={day.date} {...rowProps(day)} />
        ))}
      </div>
    </div>
  );
};
