"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  SHEET_BODY_CLASS,
  SHEET_CONTENT_CLASS,
  SHEET_FOOTER_CLASS,
  Switch,
} from "@/components/calendar/calendar-ui";
import { DateField } from "@/components/calendar/date-field";
import { DateTimeField } from "@/components/calendar/date-time-field";
import {
  ErrorText,
  FieldLabel,
  LabelPicker,
  LunarDatePicker,
  MultiDatePicker,
  OwnerPicker,
  TogglePanel,
} from "@/components/calendar/event-form-fields";
import { LabelDialog } from "@/components/calendar/label-dialog";
import {
  TemplateChips,
  type TemplateSnapshot,
} from "@/components/calendar/template-chips";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import { useInvalidateCalendar } from "@/lib/calendar/hooks";
import { solarToLunar } from "@/lib/calendar/lunar";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarLabel,
  CalendarOwner,
  CalendarRecurrence,
  CalendarSettings,
  CalendarTemplate,
  LunarDate,
} from "@/lib/calendar/types";
import { isIsoDate, todayKst } from "@/lib/calendar/view";
import { kst } from "@/lib/kst";

const RECURRENCE_OPTIONS: { value: CalendarRecurrence; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "biweekly", label: "2주마다" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
];

/** 음력 일정은 해마다만 반복할 수 있다. */
const LUNAR_RECURRENCE_OPTIONS = RECURRENCE_OPTIONS.filter(
  (option) => option.value === "none" || option.value === "yearly"
);

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const todayLunar = (): LunarDate => {
  const now = kst();
  return { year: now.year(), month: now.month() + 1, day: now.date(), leap: false };
};

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CalendarSettings;
  labels: CalendarLabel[];
  initialDate?: string;
  event?: CalendarEvent | null;
}

export const EventDialog = ({ open, ...props }: EventDialogProps) => {
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={props.onOpenChange}>
        <DialogContent data-testid="event-dialog" className={SHEET_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{props.event ? "일정 수정" : "일정 추가"}</DialogTitle>
            <DialogDescription>
              {props.event ? "일정을 고쳐요." : "새 일정을 남겨요."}
            </DialogDescription>
          </DialogHeader>
          <EventForm {...props} onManageLabels={() => setLabelDialogOpen(true)} />
        </DialogContent>
      </Dialog>
      <LabelDialog
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        labels={props.labels}
      />
    </>
  );
};

const EventForm = ({
  onOpenChange,
  settings,
  labels,
  initialDate,
  event,
  onManageLabels,
}: Omit<EventDialogProps, "open"> & { onManageLabels: () => void }) => {
  const token = useAuthStore((s) => s.token);
  const invalidate = useInvalidateCalendar();
  const { confirm, dialog } = useConfirmDialog();

  const eventStartDate = event
    ? kst(event.startAt).format("YYYY-MM-DD")
    : (initialDate ?? todayKst());
  const eventEndDate = event ? kst(event.endAt).format("YYYY-MM-DD") : eventStartDate;
  const timedEvent = event && !event.allDay ? event : null;

  const [title, setTitle] = useState(event?.title ?? "");
  const [owner, setOwner] = useState<CalendarOwner>(event?.owner ?? "together");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(eventStartDate);
  const [startTime, setStartTime] = useState(
    timedEvent ? kst(timedEvent.startAt).format("HH:mm") : "10:00"
  );
  const [endDate, setEndDate] = useState(eventEndDate);
  const [endTime, setEndTime] = useState(
    timedEvent ? kst(timedEvent.endAt).format("HH:mm") : "11:00"
  );
  const [isLunar, setIsLunar] = useState(event?.isLunar ?? false);
  const [lunar, setLunar] = useState<LunarDate>(event?.lunar ?? todayLunar);
  const [recurrence, setRecurrence] = useState<CalendarRecurrence>(
    event?.recurrence ?? "none"
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState(event?.recurrenceUntil ?? "");
  const [labelId, setLabelId] = useState<number | null>(event?.labelId ?? null);
  const [location, setLocation] = useState(event?.location ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [multiDate, setMultiDate] = useState(false);
  const [dates, setDates] = useState<string[]>([eventStartDate]);
  const [dateDraft, setDateDraft] = useState("");

  const recurrenceOptions = isLunar ? LUNAR_RECURRENCE_OPTIONS : RECURRENCE_OPTIONS;

  const lunarPreview = useQuery({
    queryKey: calendarKeys.lunarSolar(lunar.year, lunar.month, lunar.day, lunar.leap),
    queryFn: () => {
      const params = new URLSearchParams({
        year: String(lunar.year),
        month: String(lunar.month),
        day: String(lunar.day),
        leap: lunar.leap ? "1" : "0",
      });
      return calendarRequest<{ solar: string | null }>(
        token,
        `/api/calendar/lunar?${params.toString()}`
      );
    },
    enabled: Boolean(token) && isLunar,
  });
  const solarDate = lunarPreview.data?.solar ?? null;

  const toggleLunar = (next: boolean) => {
    setIsLunar(next);
    if (!next) return;
    setMultiDate(false);
    // 음력으로 바꾸면 고른 시작일을 음력으로 읽어 시작점으로 둔다.
    const converted = solarToLunar(startDate);
    if (converted) setLunar(converted);
  };

  const toggleMultiDate = (next: boolean) => {
    setMultiDate(next);
    if (next) setIsLunar(false);
  };

  const addDate = () => {
    const value = dateDraft.trim();
    if (!isIsoDate(value)) return;
    setDates((prev) => (prev.includes(value) ? prev : [...prev, value].sort()));
    setDateDraft("");
  };

  const removeDate = (value: string) => {
    setDates((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item !== value)));
  };

  const applyTemplate = (template: CalendarTemplate) => {
    setTitle(template.title);
    setOwner(template.owner);
    setAllDay(template.allDay);
    setLabelId(template.labelId);
    setLocation(template.location);
    setMemo(template.memo);
    if (!template.allDay) {
      setEndTime(
        fromMinutes(Math.min(toMinutes(startTime) + template.durationMinutes, 1439))
      );
    }
  };

  const getSnapshot = (): TemplateSnapshot => ({
    title,
    owner,
    allDay,
    labelId,
    location,
    memo,
    durationMinutes: allDay
      ? 60
      : Math.max(toMinutes(endTime) - toMinutes(startTime), 30),
  });

  // 음력·여러 날짜 일정은 하루짜리라 종료일을 따로 받지 않는다.
  const singleDay = isLunar || multiDate;
  const effectiveEndDate = singleDay ? startDate : endDate;
  const titleMissing = title.trim() === "";
  const endBeforeStart =
    !allDay && `${effectiveEndDate}T${endTime}` < `${startDate}T${startTime}`;
  const lunarInvalid = isLunar && lunarPreview.isSuccess && solarDate === null;
  const lunarLoading = isLunar && lunarPreview.isPending;
  const datesEmpty = multiDate && dates.length === 0;
  const canSave =
    !titleMissing && !endBeforeStart && !lunarInvalid && !lunarLoading && !datesEmpty;

  const buildPayload = (): CalendarEventInput => ({
    title: title.trim(),
    owner,
    allDay,
    startDate,
    endDate: effectiveEndDate,
    isLunar,
    lunar: isLunar ? lunar : null,
    recurrence,
    recurrenceUntil: recurrence === "none" ? null : recurrenceUntil || null,
    labelId,
    location: location.trim(),
    memo: memo.trim(),
    ...(allDay ? {} : { startTime, endTime }),
    ...(multiDate ? { dates } : {}),
  });

  const finish = (message: string) => {
    toast.success(message);
    void invalidate();
    onOpenChange(false);
  };

  const saveEvent = useMutation({
    mutationFn: () =>
      calendarRequest(token, "/api/calendar/events", {
        method: event ? "PATCH" : "POST",
        body: JSON.stringify(
          event ? { id: event.id, ...buildPayload() } : buildPayload()
        ),
      }),
    onSuccess: () => finish(event ? "일정을 수정했어요." : "일정을 저장했어요."),
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEvent = useMutation({
    mutationFn: (id: number) =>
      calendarRequest(token, `/api/calendar/events?id=${id}`, { method: "DELETE" }),
    onSuccess: () => finish("일정을 지웠어요."),
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmRemove = async (target: CalendarEvent) => {
    const confirmed = await confirm({
      title: "일정을 지울까요?",
      description: `${target.title} 이 일정을 삭제해요.`,
      confirmLabel: "지우기",
      destructive: true,
    });
    if (confirmed) removeEvent.mutate(target.id);
  };

  const onSubmit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (canSave) saveEvent.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className={SHEET_BODY_CLASS}>
        <TemplateChips onApply={applyTemplate} getSnapshot={getSnapshot} />

        <div>
          <FieldLabel htmlFor="event-title">제목</FieldLabel>
          <Input
            id="event-title"
            data-testid="field-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 데이트"
            maxLength={200}
            autoComplete="off"
            className="mt-1"
          />
          {titleMissing && <ErrorText className="mt-1">제목을 입력해 주세요</ErrorText>}
        </div>

        <div>
          <FieldLabel>참여자</FieldLabel>
          <OwnerPicker value={owner} onChange={setOwner} />
        </div>

        <TogglePanel
          title="종일"
          control={
            <Switch
              checked={allDay}
              onCheckedChange={setAllDay}
              label="종일"
              testId="switch-allday"
            />
          }
        />

        <div className="grid grid-cols-2 gap-2">
          {isLunar && (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[12px] font-medium text-muted">시작</span>
              <div className="flex h-9 items-center rounded-lg border border-hairline bg-canvas-soft px-2.5 text-[13px] text-body tabular-nums">
                음력 {lunar.year}. {lunar.month}. {lunar.day}.{lunar.leap && " (윤달)"}
              </div>
            </div>
          )}
          {!isLunar && (
            <DateTimeField
              label="시작"
              testId="field-start-date"
              date={startDate}
              time={startTime}
              onDateChange={setStartDate}
              onTimeChange={setStartTime}
              hideTime={allDay}
            />
          )}
          {!singleDay && (
            <DateTimeField
              label="종료"
              testId="field-end-date"
              date={endDate}
              time={endTime}
              onDateChange={setEndDate}
              onTimeChange={setEndTime}
              minDate={startDate}
              invalid={endBeforeStart}
              hideTime={allDay}
            />
          )}
        </div>
        {endBeforeStart && (
          <ErrorText className="-mt-2">종료 시각이 시작 시각보다 빠릅니다.</ErrorText>
        )}

        {settings.lunarEvent && (
          <TogglePanel
            title="음력"
            control={
              <Switch checked={isLunar} onCheckedChange={toggleLunar} label="음력" />
            }
          >
            {isLunar && (
              <LunarDatePicker
                value={lunar}
                onChange={setLunar}
                solarDate={solarDate}
                loading={lunarLoading}
              />
            )}
          </TogglePanel>
        )}

        <div>
          <FieldLabel>반복</FieldLabel>
          <Select
            items={recurrenceOptions}
            value={recurrence}
            onValueChange={(value) => {
              if (value != null) setRecurrence(value as CalendarRecurrence);
            }}
          >
            <SelectTrigger className="mt-1 w-full" aria-label="반복">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recurrenceOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {recurrence !== "none" && (
            <div className="mt-2">
              <FieldLabel>반복 종료일(선택)</FieldLabel>
              <DateField
                label="반복 종료"
                testId="field-recurrence-until"
                value={recurrenceUntil}
                min={startDate}
                onChange={setRecurrenceUntil}
                className="mt-1"
              />
            </div>
          )}
        </div>

        {!event && (
          <TogglePanel
            title="여러 날짜"
            control={
              <Switch
                checked={multiDate}
                onCheckedChange={toggleMultiDate}
                label="여러 날짜"
                disabled={isLunar}
              />
            }
          >
            {multiDate && (
              <MultiDatePicker
                dates={dates}
                draft={dateDraft}
                onDraftChange={setDateDraft}
                onAdd={addDate}
                onRemove={removeDate}
              />
            )}
          </TogglePanel>
        )}

        <LabelPicker
          labels={labels}
          value={labelId}
          onChange={setLabelId}
          onManage={onManageLabels}
        />

        <div>
          <FieldLabel htmlFor="event-location">위치</FieldLabel>
          <Input
            id="event-location"
            data-testid="field-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 성수동 카페"
            autoComplete="off"
            className="mt-1"
          />
        </div>

        <div>
          <FieldLabel htmlFor="event-memo">메모</FieldLabel>
          <Textarea
            id="event-memo"
            data-testid="field-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="자세히 남기고 싶은 내용"
            rows={2}
            className="mt-1"
          />
        </div>

        {event && event.recurrence !== "none" && (
          <p className="rounded-lg bg-canvas-soft px-3 py-2 text-[11px] text-muted">
            반복 일정은 전체 회차에 적용됩니다
          </p>
        )}
      </div>

      <div className={SHEET_FOOTER_CLASS}>
        <div>
          {event && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="btn-delete-event"
              className="text-destructive hover:text-destructive"
              disabled={removeEvent.isPending}
              onClick={() => confirmRemove(event)}
            >
              삭제
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="submit"
            data-testid="btn-save-event"
            disabled={!canSave || saveEvent.isPending}
          >
            {saveEvent.isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
      {dialog}
    </form>
  );
};
