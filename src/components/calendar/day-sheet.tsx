"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import { MOODS, VIEWER_NAME, moodEmoji, ownerName } from "@/lib/calendar/format";
import { labelColor } from "@/lib/calendar/labels";
import type {
  CalendarDayPayload,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
  CalendarViewer,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

export const DaySheet = ({
  date,
  open,
  onOpenChange,
  viewer,
  settings,
  labels,
  filter,
  onEditEvent,
  onAddEvent,
  onOpenDiary,
}: {
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: CalendarViewer;
  settings: CalendarSettings;
  labels: CalendarLabel[];
  filter: { wonchan: boolean; yeeun: boolean; together: boolean };
  onEditEvent: (event: CalendarOccurrence) => void;
  onAddEvent: (date: string) => void;
  onOpenDiary: (date: string) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: calendarKeys.day(date ?? ""),
    queryFn: () =>
      calendarRequest<CalendarDayPayload>(token, `/api/calendar/day?date=${date}`),
    enabled: open && Boolean(token) && date != null,
  });

  const deleteEvent = useMutation({
    mutationFn: (id: number) =>
      calendarRequest<{ ok: boolean }>(token, `/api/calendar/events?id=${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar"] }),
    onError: () => toast.error("일정을 삭제하지 못했어요"),
  });

  const labelById = (labelId: number | null): string => {
    if (labelId == null) return "var(--color-primary)";
    const label = labels.find((item) => item.id === labelId);
    return label ? labelColor(label.color) : "var(--color-primary)";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="day-sheet"
        className={cn(
          "max-h-[85dvh] overflow-y-auto rounded-t-3xl rounded-b-none",
          "top-auto right-0 bottom-0 left-0 max-w-none translate-x-0 translate-y-0",
          "sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        )}
      >
        {date == null || isPending ? (
          <div className="grid place-items-center py-10">
            <Spinner className="text-primary" />
          </div>
        ) : isError || !data ? (
          <div className="py-10 text-center">
            <p className="text-[13px] text-muted">이 날짜를 불러오지 못했어요</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle data-testid="day-sheet-date" className="text-base">
                {kst(data.date).format("M월 D일 dddd")}
              </DialogTitle>
              {settings.lunarDetail && data.day.lunar && (
                <p className="text-[13px] text-muted-soft">{data.day.lunar.label}</p>
              )}
              {settings.showHolidays && data.day.holiday && (
                <p className="text-[13px] text-error">{data.day.holiday}</p>
              )}
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onAddEvent(data.date)}>
                <Plus /> 일정 추가
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenDiary(data.date)}>
                <Pencil /> 일기
              </Button>
            </div>

            <div className="space-y-2">
              {data.events.filter((event) => filter[event.owner]).length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted">
                  이 날은 일정이 없어요
                </p>
              ) : (
                data.events
                  .filter((event) => filter[event.owner])
                  .map((event) => (
                    <div
                      key={event.occurrenceKey}
                      className="flex items-start gap-2 rounded-xl border border-hairline bg-surface p-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 h-12 w-1 shrink-0 rounded-full"
                        style={{ background: labelById(event.labelId) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {ownerName(event.owner, viewer)} ·{" "}
                          {event.allDay
                            ? "종일"
                            : `${kst(event.startAt).format("HH:mm")} – ${kst(event.endAt).format("HH:mm")}`}
                        </p>
                        {event.location && (
                          <p className="mt-0.5 truncate text-[11px] text-muted">
                            {event.location}
                          </p>
                        )}
                        {event.memo && (
                          <p className="mt-1 text-[12px] leading-snug whitespace-pre-wrap text-body">
                            {event.memo}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="일정 수정"
                          onClick={() => onEditEvent(event)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="일정 삭제"
                          disabled={deleteEvent.isPending}
                          onClick={() => deleteEvent.mutate(event.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <section className="mt-2">
              <h3 className="px-0.5 pb-1.5 text-[13px] font-semibold text-ink">일기</h3>
              {data.diaries.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-muted">
                  이 날 일기가 없어요
                </p>
              ) : (
                <div className="space-y-2">
                  {data.diaries.map((diary) => {
                    const moodLabel =
                      MOODS.find((mood) => mood.key === diary.mood)?.label ?? "";
                    return (
                      <button
                        key={diary.id}
                        type="button"
                        onClick={() => onOpenDiary(data.date)}
                        className="w-full rounded-xl border border-hairline bg-surface p-2.5 text-left transition-colors hover:bg-canvas-soft/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-ink">
                            {VIEWER_NAME[diary.author]}
                          </span>
                          <span className="text-[11px] text-muted-soft">
                            {moodEmoji(diary.mood)} {moodLabel}
                          </span>
                        </div>
                        {diary.body && (
                          <p className="mt-1 text-[13px] leading-snug whitespace-pre-wrap text-body">
                            {diary.body}
                          </p>
                        )}
                        {diary.photos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {diary.photos.map((photo) => (
                              <img
                                key={photo.id}
                                src={photo.thumb}
                                alt=""
                                className="size-14 rounded-lg object-cover ring-1 ring-hairline"
                              />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
