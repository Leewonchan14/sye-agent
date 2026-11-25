"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { calendarRequest } from "@/lib/calendar/client";
import { MOODS, VIEWER_NAME, moodEmoji } from "@/lib/calendar/format";
import type {
  CalendarDayInfo,
  CalendarDiarySummary,
  CalendarSettings,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

import { monthGridCells, weekdayLabels } from "@/components/calendar/month-view";

const DiaryCard = ({
  diary,
  onOpen,
}: {
  diary: CalendarDiarySummary;
  onOpen: (date: string) => void;
}) => {
  const moodLabel = MOODS.find((mood) => mood.key === diary.mood)?.label ?? "";
  return (
    <button
      type="button"
      data-testid={`diary-card-${diary.id}`}
      onClick={() => onOpen(diary.date)}
      className="flex w-full items-start gap-3 rounded-2xl border border-hairline bg-surface p-3 text-left transition-colors hover:bg-canvas-soft/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-ink">
            {kst(diary.date).format("M월 D일 ddd")} · {VIEWER_NAME[diary.author]}
          </span>
          <span className="shrink-0 text-[11px] text-muted-soft">
            {moodEmoji(diary.mood)} {moodLabel}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-body">
          {diary.excerpt}
        </p>
      </div>
      {diary.thumbs[0] && (
        <img
          src={diary.thumbs[0]}
          alt=""
          className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-hairline"
        />
      )}
    </button>
  );
};

export const DiaryCalendarView = ({
  days,
  diaries,
  settings,
  selectedDate,
  onSelectDay,
  onOpenDiary,
}: {
  days: CalendarDayInfo[];
  diaries: CalendarDiarySummary[];
  settings: CalendarSettings;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  onOpenDiary: (date: string) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const today = kst().format("YYYY-MM-DD");

  const diariesByDate = useMemo(() => {
    const map = new Map<string, CalendarDiarySummary[]>();
    for (const diary of diaries) {
      const list = map.get(diary.date) ?? [];
      list.push(diary);
      map.set(diary.date, list);
    }
    return map;
  }, [diaries]);

  const sortedDiaries = useMemo(
    () => [...diaries].sort((a, b) => a.date.localeCompare(b.date)),
    [diaries]
  );

  const enablePlus = useMutation({
    mutationFn: () =>
      calendarRequest<{ settings: CalendarSettings }>(token, "/api/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plus: true }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar"] }),
    onError: () => toast.error("Plus를 켜지 못했어요"),
  });

  if (!settings.plus) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface px-6 py-12 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-canvas-soft text-primary">
          <Lock className="size-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-ink">Plus 전용</p>
        <p className="mt-1 text-[13px] text-muted">
          일기 모아보기와 일기 페이지는 Plus에서 쓸 수 있어요
        </p>
        <Button
          className="mt-4"
          onClick={() => enablePlus.mutate()}
          disabled={enablePlus.isPending}
        >
          Plus 켜기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
        <div className="grid grid-cols-7 gap-1">
          {weekdayLabels(settings.weekStart).map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="py-1 text-center text-[10px] font-medium text-muted"
            >
              {label}
            </div>
          ))}

          {monthGridCells(days, settings.weekStart).map((day, index) => {
            if (!day) return <div key={`empty-${index}`} />;

            const list = diariesByDate.get(day.date) ?? [];
            const first = list[0];
            const isToday = day.date === today;
            const isSelected = day.date === selectedDate;
            const dateNum = Number(day.date.slice(-2));

            return (
              <button
                key={day.date}
                type="button"
                data-testid={`diary-day-${day.date}`}
                aria-pressed={isSelected}
                aria-label={kst(day.date).format("M월 D일 dddd")}
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "flex min-h-16 flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-1 text-left transition-colors",
                  isSelected && "border-primary bg-canvas-card ring-1 ring-primary/50",
                  !isSelected && "border-transparent hover:bg-canvas-soft/70",
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
                  <span className="text-[11px] font-medium text-body tabular-nums">
                    {dateNum}
                  </span>
                )}

                {first && (
                  <div className="mt-0.5 flex items-center gap-1">
                    {first.thumbs[0] ? (
                      <>
                        <img
                          src={first.thumbs[0]}
                          alt=""
                          className="size-4 shrink-0 rounded object-cover"
                        />
                        <span className="text-[10px] leading-none">
                          {moodEmoji(first.mood)}
                        </span>
                        <span className="text-[8px] leading-none text-muted-soft">
                          {VIEWER_NAME[first.author][0]}
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span className="text-[8px] leading-none text-muted-soft">
                          일기
                        </span>
                        <span className="text-[8px] leading-none text-muted-soft">
                          {VIEWER_NAME[first.author][0]}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-2">
          <h3 className="text-[13px] font-semibold text-ink">이 달 일기</h3>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted tabular-nums">
              {diaries.length}편
            </span>
            <Link
              href="/calendar/diary"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              일기 페이지
            </Link>
          </div>
        </div>
        {sortedDiaries.length === 0 ? (
          <p className="px-1 py-8 text-center text-[12px] text-muted">
            이 달 일기가 없어요
          </p>
        ) : (
          <div className="space-y-2">
            {sortedDiaries.map((diary) => (
              <DiaryCard key={diary.id} diary={diary} onOpen={onOpenDiary} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
