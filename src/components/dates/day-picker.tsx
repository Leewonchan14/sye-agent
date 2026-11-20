"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { ko } from "react-day-picker/locale";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateDaySummary } from "@/lib/dates/types";
import { cn } from "@/lib/utils";

/*
 * 달력은 브라우저 로컬 Date를 쓰므로, KST 날짜를 "연·월·일"만 같은 로컬 Date로 주고받는다.
 * 그래야 기기 시간대가 달라도 고른 날짜가 하루씩 밀리지 않는다.
 */
const toLocalDate = (dayKey: string) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

/**
 * 최근 날짜 칩 옆에 두는 날짜 고르기. 칩에 없는 지난 날짜로 바로 갈 때 쓴다.
 * 조사한 날(과 오늘)만 고를 수 있고, 추천이 있는 날은 점으로 표시한다.
 */
export const DateDayPicker = ({
  days,
  selected,
  todayKey,
  label,
  active,
  onSelect,
}: {
  /** 조사한 날짜(최신순, 오늘 포함) */
  days: DateDaySummary[];
  /** 보고 있는 날짜(YYYY-MM-DD) */
  selected: string;
  todayKey: string;
  /** 칩에 없는 날짜를 보고 있으면 그 날짜, 아니면 null */
  label: string | null;
  active: boolean;
  onSelect: (dayKey: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const known = new Set(days.map((d) => d.dayKey));
  const withSpots = days.filter((d) => d.count > 0).map((d) => toLocalDate(d.dayKey));
  const oldest = days.at(-1)?.dayKey ?? todayKey;
  const today = toLocalDate(todayKey);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label ? `날짜 고르기, ${label} 보는 중` : "날짜 고르기"}
            aria-pressed={active}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-muted ring-1 ring-hairline transition-colors hover:bg-canvas-soft hover:text-body",
              active && "bg-canvas-card text-ink"
            )}
          />
        }
      >
        <CalendarDays className="size-3.5 text-primary" />
        {label ?? "날짜"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          locale={ko}
          selected={toLocalDate(selected)}
          defaultMonth={toLocalDate(selected)}
          captionLayout="dropdown"
          startMonth={toLocalDate(oldest)}
          endMonth={today}
          // 조사한 날(과 오늘)만 고를 수 있다.
          disabled={(date) => {
            const key = toDayKey(date);
            return key !== todayKey && !known.has(key);
          }}
          modifiers={{ hasSpots: withSpots }}
          modifiersClassNames={{
            hasSpots:
              "after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
          }}
          onSelect={(date) => {
            if (!date) return;
            onSelect(toDayKey(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
