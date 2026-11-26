"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Polaroid } from "@/components/calendar/calendar-ui";
import { DiaryComments } from "@/components/calendar/diary-comments";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import {
  CALENDAR_LIVE_QUERY,
  calendarKeys,
  calendarRequest,
} from "@/lib/calendar/client";
import { VIEWER_NAME, ownerName } from "@/lib/calendar/format";
import { useInvalidateCalendar } from "@/lib/calendar/hooks";
import type {
  CalendarDayPayload,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import { eventTimeRange, labelColorResolver } from "@/lib/calendar/view";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

export const DaySheet = ({
  date,
  open,
  onOpenChange,
  settings,
  labels,
  onEditEvent,
  onAddEvent,
  onOpenDiary,
}: {
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CalendarSettings;
  labels: CalendarLabel[];
  onEditEvent: (event: CalendarOccurrence) => void;
  onAddEvent: (date: string) => void;
  onOpenDiary: (date: string) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const invalidate = useInvalidateCalendar();
  const { confirm, dialog } = useConfirmDialog();

  const { data, isPending, isError } = useQuery({
    queryKey: calendarKeys.day(date ?? ""),
    queryFn: () =>
      calendarRequest<CalendarDayPayload>(token, `/api/calendar/day?date=${date}`),
    enabled: open && Boolean(token) && date != null,
    ...CALENDAR_LIVE_QUERY,
  });

  const deleteEvent = useMutation({
    mutationFn: (id: number) =>
      calendarRequest<{ ok: boolean }>(token, `/api/calendar/events?id=${id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
    onError: () => toast.error("일정을 삭제하지 못했어요"),
  });

  const colorOf = labelColorResolver(labels);

  const handleDelete = async (event: CalendarOccurrence) => {
    const confirmed = await confirm({
      title: "일정을 지울까요?",
      description: event.title,
      confirmLabel: "지우기",
      destructive: true,
    });
    if (confirmed) deleteEvent.mutate(event.id);
  };

  return (
    <>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenDiary(data.date)}
                >
                  <Pencil /> 일기
                </Button>
              </div>

              <div className="space-y-2">
                {data.events.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-muted">
                    이 날은 일정이 없어요
                  </p>
                ) : (
                  data.events.map((event) => (
                    <div
                      key={event.occurrenceKey}
                      className="flex items-start gap-2 rounded-xl border border-hairline bg-surface p-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 h-12 w-1 shrink-0 rounded-full"
                        style={{ background: colorOf(event.labelId) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {ownerName(event.owner)} · {eventTimeRange(event)}
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
                          data-testid="btn-delete-day-event"
                          disabled={deleteEvent.isPending}
                          onClick={() => handleDelete(event)}
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
                    {data.diaries.map((diary) => (
                      <div
                        key={diary.id}
                        className="rounded-xl border border-hairline bg-surface p-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenDiary(data.date)}
                          className="block w-full rounded-lg text-left transition-colors hover:bg-canvas-soft/60"
                        >
                          <span className="text-[11px] font-medium text-ink">
                            {VIEWER_NAME[diary.author]}
                          </span>
                          {diary.body && (
                            <p className="mt-1 text-[13px] leading-snug whitespace-pre-wrap text-body">
                              {diary.body}
                            </p>
                          )}
                          {diary.photos.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {diary.photos.map((photo, index) => (
                                <Polaroid
                                  key={photo.id}
                                  src={photo.thumb}
                                  className={cn(
                                    "w-16",
                                    index % 2 === 0 && "-rotate-2",
                                    index % 2 === 1 && "rotate-2"
                                  )}
                                />
                              ))}
                            </div>
                          )}
                        </button>
                        <DiaryComments
                          diary={diary}
                          className="mt-2.5 border-t border-hairline pt-2.5"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
};
