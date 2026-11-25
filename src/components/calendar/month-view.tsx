"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

import { labelColor } from "@/lib/calendar/labels";
import type {
  CalendarDayInfo,
  CalendarDiarySummary,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

export const weekdayLabels = (weekStart: 0 | 1): string[] =>
  weekStart === 0
    ? ["일", "월", "화", "수", "목", "금", "토"]
    : ["월", "화", "수", "목", "금", "토", "일"];

/** 월 그리드 칸 배열. weekStart에 맞춰 앞을 빈 칸으로 채우고, 끝도 7의 배수로 맞춘다. */
export const monthGridCells = (
  days: CalendarDayInfo[],
  weekStart: 0 | 1
): (CalendarDayInfo | null)[] => {
  const first = days[0];
  if (!first) return [];
  const leading = (first.weekday - weekStart + 7) % 7;
  const cells: (CalendarDayInfo | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const compareOccurrences = (
  a: CalendarOccurrence,
  b: CalendarOccurrence
): number => {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startAt.localeCompare(b.startAt);
};

const dateColorClass = (day: CalendarDayInfo, settings: CalendarSettings): string => {
  if (settings.showHolidays && day.holiday) return "text-error";
  if (settings.highlightWeekend && day.weekday === 0) return "text-error";
  if (settings.highlightWeekend && day.weekday === 6) return "text-muted-soft";
  return "text-body";
};

const EventChip = ({ event, color }: { event: CalendarOccurrence; color: string }) => {
  const time = event.allDay ? null : kst(event.startAt).format("HH:mm");
  const tint = color.startsWith("#") ? `${color}20` : "var(--color-canvas-soft)";
  return (
    <div
      data-testid={`event-chip-${event.occurrenceKey}`}
      className="hidden w-full min-w-0 items-center gap-1 rounded px-1 py-px text-[10px] leading-tight md:flex md:text-[11px]"
      style={{ backgroundColor: tint }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate text-body">{event.title}</span>
      {time && <span className="shrink-0 text-muted-soft tabular-nums">{time}</span>}
      {event.owner === "together" && (
        <Heart aria-hidden="true" className="size-2.5 shrink-0 text-primary" />
      )}
    </div>
  );
};

export const MonthView = ({
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
    return map;
  }, [events, days]);

  const diaryThumbByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const diary of diaries) {
      if (!map.has(diary.date) && diary.thumbs[0]) map.set(diary.date, diary.thumbs[0]);
    }
    return map;
  }, [diaries]);

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
      <div data-testid="month-grid" className="grid grid-cols-7 gap-1">
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

        {monthGridCells(days, settings.weekStart).map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;

          const dayEvents = (eventsByDate.get(day.date) ?? []).sort(compareOccurrences);
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - 3;
          const thumb = diaryThumbByDate.get(day.date);
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          const dateNum = Number(day.date.slice(-2));

          return (
            <button
              key={day.date}
              type="button"
              data-testid={`day-cell-${day.date}`}
              aria-label={`${kst(day.date).format("M월 D일 dddd")}, 일정 ${dayEvents.length}개`}
              onClick={() => onSelectDay(day.date)}
              className={cn(
                "relative flex min-h-[76px] flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition-colors md:min-h-24",
                isSelected && "border-primary bg-canvas-card ring-1 ring-primary/50",
                !isSelected && "border-hairline-soft/80 hover:bg-canvas-soft/70",
                isToday && !isSelected && "ring-1 ring-primary/40"
              )}
            >
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
                    "text-[11px] font-medium tabular-nums",
                    dateColorClass(day, settings)
                  )}
                >
                  {dateNum}
                </span>
              )}

              {settings.lunarMonth && day.lunar && (
                <span className="text-[8px] leading-none text-muted-soft">
                  {day.lunar.label}
                </span>
              )}
              {settings.showHolidays && day.holiday && (
                <span className="w-full truncate text-[8px] leading-none text-error">
                  {day.holiday}
                </span>
              )}

              <div className="mt-0.5 hidden w-full flex-col gap-0.5 md:flex">
                {visible.map((event) => (
                  <EventChip
                    key={event.occurrenceKey}
                    event={event}
                    color={colorOf(event.labelId)}
                  />
                ))}
                {overflow > 0 && (
                  <span className="px-0.5 text-[9px] text-muted-soft tabular-nums">
                    +{overflow}
                  </span>
                )}
              </div>

              {/* 폰 폭에서는 글자가 들어가지 않아 라벨 색 점만 남긴다. 상세는 날짜를 눌러 본다. */}
              <div className="mt-0.5 flex w-full flex-wrap content-start gap-1 md:hidden">
                {dayEvents.slice(0, 4).map((event) => (
                  <span
                    key={event.occurrenceKey}
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ background: colorOf(event.labelId) }}
                  />
                ))}
                {dayEvents.length > 4 && (
                  <span className="text-[8px] leading-none text-muted-soft tabular-nums">
                    +{dayEvents.length - 4}
                  </span>
                )}
              </div>

              {settings.showPhotos && thumb && (
                <img
                  src={thumb}
                  alt=""
                  className="absolute right-1 bottom-1 size-3.5 rounded object-cover ring-1 ring-hairline md:top-1 md:right-1 md:bottom-auto md:size-5 md:rounded-md"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
