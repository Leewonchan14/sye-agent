"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import { labelColor } from "@/lib/calendar/labels";
import type {
  CalendarDayInfo,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

import { compareOccurrences, weekdayLabels } from "@/components/calendar/month-view";

const dateColorClass = (day: CalendarDayInfo, settings: CalendarSettings): string => {
  if (settings.showHolidays && day.holiday) return "text-error";
  if (settings.highlightWeekend && day.weekday === 0) return "text-error";
  if (settings.highlightWeekend && day.weekday === 6) return "text-muted-soft";
  return "text-body";
};

const timeText = (event: CalendarOccurrence): string =>
  event.allDay ? "종일" : kst(event.startAt).format("HH:mm");

/**
 * 2주 보기.
 *
 * 폰 폭(7칸 ≈ 55px)에서는 칸 안에 제목이 들어가지 않으므로 14일 세로 목록으로 보여 주고,
 * md 이상에서만 7×2 격자를 쓴다. 두 표현 모두 같은 날짜를 눌러 상세 시트를 연다.
 */
export const TwoWeekView = ({
  days,
  events,
  labels,
  settings,
  selectedDate,
  onSelectDay,
}: {
  days: CalendarDayInfo[];
  events: CalendarOccurrence[];
  labels: CalendarLabel[];
  settings: CalendarSettings;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) => {
  const today = kst().format("YYYY-MM-DD");

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const ev of events) {
      for (const day of days) {
        if (day.date >= ev.occurrenceDate && day.date <= ev.occurrenceEndDate) {
          const list = map.get(day.date) ?? [];
          list.push(ev);
          map.set(day.date, list);
        }
      }
    }
    for (const list of map.values()) list.sort(compareOccurrences);
    return map;
  }, [events, days]);

  const labelsById = useMemo(
    () => new Map(labels.map((label) => [label.id, label])),
    [labels]
  );

  const colorOf = (labelId: number | null): string => {
    if (labelId == null) return "var(--color-primary)";
    const label = labelsById.get(labelId);
    return label ? labelColor(label.color) : "var(--color-primary)";
  };

  const sundayIndex = settings.weekStart === 0 ? 0 : 6;
  const saturdayIndex = settings.weekStart === 0 ? 6 : 5;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
      {/* 폰: 14일 세로 목록 */}
      <div
        data-testid="two-week-list"
        className="divide-y divide-hairline-soft md:hidden"
      >
        {days.map((day) => {
          const dayEvents = eventsByDate.get(day.date) ?? [];
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          return (
            <button
              key={day.date}
              type="button"
              data-testid={`two-week-day-${day.date}`}
              aria-label={`${kst(day.date).format("M월 D일 dddd")}, 일정 ${dayEvents.length}개`}
              onClick={() => onSelectDay(day.date)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left transition-colors",
                isSelected && "bg-canvas-card",
                isToday && !isSelected && "bg-primary/5"
              )}
            >
              <div className="w-9 shrink-0 text-center">
                <div
                  className={cn(
                    "mx-auto grid size-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : dateColorClass(day, settings)
                  )}
                >
                  {Number(day.date.slice(-2))}
                </div>
                <div className="mt-0.5 text-[9px] text-muted-soft">
                  {
                    weekdayLabels(settings.weekStart)[
                      (day.weekday - settings.weekStart + 7) % 7
                    ]
                  }
                </div>
                {settings.lunarMonth && day.lunar && (
                  <div className="mt-0.5 truncate text-[8px] text-muted-soft">
                    {day.lunar.label}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                {settings.showHolidays && day.holiday && (
                  <div className="truncate text-[10px] font-medium text-error">
                    {day.holiday}
                  </div>
                )}
                {dayEvents.length === 0 ? (
                  <div className="pt-0.5 text-[11px] leading-6 text-muted-soft">
                    일정 없음
                  </div>
                ) : (
                  dayEvents.map((event) => (
                    <div
                      key={event.occurrenceKey}
                      className="flex min-w-0 items-center gap-1.5 text-[12px]"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: colorOf(event.labelId) }}
                      />
                      <span className="truncate text-body">{event.title}</span>
                      {event.owner === "together" && (
                        <Heart
                          aria-hidden="true"
                          className="size-3 shrink-0 text-primary"
                        />
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-muted-soft tabular-nums">
                        {timeText(event)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* md 이상: 7×2 격자 */}
      <div data-testid="two-week-grid" className="hidden grid-cols-7 gap-1 md:grid">
        {weekdayLabels(settings.weekStart).map((label, index) => (
          <div
            key={`${label}-${index}`}
            className={cn(
              "py-1 text-center text-[10px] font-medium",
              index === sundayIndex && "text-error",
              index === saturdayIndex && "text-muted-soft",
              index !== sundayIndex && index !== saturdayIndex && "text-muted"
            )}
          >
            {label}
          </div>
        ))}

        {days.map((day) => {
          const dayEvents = eventsByDate.get(day.date) ?? [];
          const visible = dayEvents.slice(0, 5);
          const overflow = dayEvents.length - 5;
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          const dateNum = Number(day.date.slice(-2));

          return (
            <button
              key={day.date}
              type="button"
              data-testid={`twoweek-cell-${day.date}`}
              aria-pressed={isSelected}
              aria-label={`${kst(day.date).format("M월 D일 dddd")}, 일정 ${dayEvents.length}개`}
              onClick={() => onSelectDay(day.date)}
              className={cn(
                "flex min-h-40 flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-1.5 text-left transition-colors",
                isSelected && "border-primary bg-canvas-card ring-1 ring-primary/50",
                !isSelected && "border-hairline-soft/80 hover:bg-canvas-soft/70",
                isToday && !isSelected && "ring-1 ring-primary/40"
              )}
            >
              <div className="flex w-full items-center justify-between">
                {isToday ? (
                  <span
                    data-testid="today-cell"
                    className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums"
                  >
                    {dateNum}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-[12px] font-medium tabular-nums",
                      dateColorClass(day, settings)
                    )}
                  >
                    {dateNum}
                  </span>
                )}
                {settings.lunarMonth && day.lunar && (
                  <span className="truncate text-[8px] text-muted-soft">
                    {day.lunar.label}
                  </span>
                )}
              </div>
              {settings.showHolidays && day.holiday && (
                <span className="w-full truncate text-[9px] leading-tight text-error">
                  {day.holiday}
                </span>
              )}
              <div className="mt-1 w-full space-y-1">
                {visible.map((event) => (
                  <div
                    key={event.occurrenceKey}
                    className="flex min-w-0 items-start gap-1 text-[10px] leading-tight"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: colorOf(event.labelId) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-body">
                      {event.title}
                    </span>
                    <span className="shrink-0 text-muted-soft tabular-nums">
                      {timeText(event)}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] text-muted-soft tabular-nums">
                    +{overflow}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
