"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DateField } from "@/components/calendar/date-field";
import { LabelDialog } from "@/components/calendar/label-dialog";
import {
  TemplateChips,
  type TemplateSnapshot,
} from "@/components/calendar/template-chips";
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
import { calendarRequest } from "@/lib/calendar/client";
import { labelColor } from "@/lib/calendar/labels";
import { solarToLunar } from "@/lib/calendar/lunar";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarLabel,
  CalendarOwner,
  CalendarRecurrence,
  CalendarSettings,
  CalendarTemplate,
  CalendarViewer,
  LunarDate,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

const SHEET_CONTENT_CLASS =
  "flex max-h-[85dvh] flex-col overflow-hidden left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-t-3xl rounded-b-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl";

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const Switch = ({
  checked,
  onCheckedChange,
  label,
  testId,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  testId?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    data-testid={testId}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
      checked ? "border-primary bg-primary" : "border-hairline bg-canvas-strong"
    )}
  >
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
        checked ? "translate-x-4.5" : "translate-x-0.5"
      )}
    />
  </button>
);

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: CalendarViewer;
  settings: CalendarSettings;
  labels: CalendarLabel[];
  initialDate?: string;
  event?: CalendarEvent | null;
  onSaved: () => void;
  onLabelsChanged: () => void;
}

export const EventDialog = (props: EventDialogProps) => {
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const { open, ...rest } = props;
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
          <EventForm {...rest} onManageLabels={() => setLabelDialogOpen(true)} />
        </DialogContent>
      </Dialog>
      <LabelDialog
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        labels={props.labels}
        onChanged={props.onLabelsChanged}
      />
    </>
  );
};

const EventForm = ({
  onOpenChange,
  viewer,
  settings,
  labels,
  initialDate,
  event,
  onSaved,
  onManageLabels,
}: Omit<EventDialogProps, "open"> & { onManageLabels: () => void }) => {
  const token = useAuthStore((s) => s.token);

  const today = kst().format("YYYY-MM-DD");
  const eventStartDate = event
    ? kst(event.startAt).format("YYYY-MM-DD")
    : (initialDate ?? today);
  const eventEndDate = event ? kst(event.endAt).format("YYYY-MM-DD") : eventStartDate;

  const [title, setTitle] = useState(event?.title ?? "");
  const [owner, setOwner] = useState<CalendarOwner>(event?.owner ?? viewer);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(eventStartDate);
  const [startTime, setStartTime] = useState(
    event && !event.allDay ? kst(event.startAt).format("HH:mm") : "10:00"
  );
  const [endDate, setEndDate] = useState(eventEndDate);
  const [endTime, setEndTime] = useState(
    event && !event.allDay ? kst(event.endAt).format("HH:mm") : "11:00"
  );
  const [isLunar, setIsLunar] = useState(event?.isLunar ?? false);
  const [lunar, setLunar] = useState<LunarDate>(
    event?.lunar ?? {
      year: kst().year(),
      month: kst().month() + 1,
      day: kst().date(),
      leap: false,
    }
  );
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const timeSlots = useMemo(() => {
    const step = settings.minuteStep || 10;
    const set = new Set<string>();
    for (let minute = 0; minute < 1440; minute += step) {
      set.add(fromMinutes(minute));
    }
    set.add(startTime);
    set.add(endTime);
    return Array.from(set).sort();
  }, [settings.minuteStep, startTime, endTime]);

  const recurrenceOptions = useMemo(() => {
    const options: { value: CalendarRecurrence; label: string }[] = [
      { value: "none", label: "없음" },
      { value: "daily", label: "매일" },
      { value: "weekly", label: "매주" },
      { value: "biweekly", label: "2주마다" },
      { value: "monthly", label: "매월" },
      { value: "yearly", label: "매년" },
    ];
    if (isLunar) {
      return options.filter(
        (option) => option.value === "none" || option.value === "yearly"
      );
    }
    return options;
  }, [isLunar]);

  const lunarYears = useMemo(() => {
    const years: number[] = [];
    for (let year = 1900; year <= 2050; year += 1) years.push(year);
    return years;
  }, []);
  const lunarMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const lunarDays = useMemo(() => Array.from({ length: 30 }, (_, i) => i + 1), []);

  const lunarPreview = useQuery({
    queryKey: ["calendar", "lunar", lunar.year, lunar.month, lunar.day, lunar.leap],
    queryFn: async () => {
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
    if (next) {
      setMultiDate(false);
      // 음력으로 바꾸면 '오늘'을 음력 날짜로 읽어 시작점으로 둔다.
      const converted = solarToLunar(startDate);
      if (converted) setLunar(converted);
    }
  };

  const toggleMultiDate = (next: boolean) => {
    setMultiDate(next);
    if (next) setIsLunar(false);
  };

  const addDate = () => {
    const value = dateDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
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

  const effectiveEndDate = isLunar || multiDate ? startDate : endDate;
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

  const saveEvent = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (event) {
        await calendarRequest<{ event: CalendarEvent }>(token, "/api/calendar/events", {
          method: "PATCH",
          body: JSON.stringify({ id: event.id, ...payload }),
        });
        return;
      }
      await calendarRequest<{ events: CalendarEvent[] }>(token, "/api/calendar/events", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(event ? "일정을 수정했어요." : "일정을 저장했어요.");
      onSaved();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEvent = useMutation({
    mutationFn: () =>
      calendarRequest<{ ok: true }>(token, `/api/calendar/events?id=${event?.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("일정을 지웠어요.");
      onSaved();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!canSave) return;
    saveEvent.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <TemplateChips onApply={applyTemplate} getSnapshot={getSnapshot} />

        <div>
          <label className="text-[12px] font-medium text-muted" htmlFor="event-title">
            제목
          </label>
          <Input
            id="event-title"
            data-testid="field-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 데이트"
            maxLength={200}
            autoComplete="off"
            className="mt-1"
          />
          {titleMissing && (
            <p className="mt-1 text-[11px] text-destructive">제목을 입력해 주세요</p>
          )}
        </div>

        <div>
          <p className="text-[12px] font-medium text-muted">참여자</p>
          <div
            className="mt-1 grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="참여자"
          >
            <button
              type="button"
              role="radio"
              aria-checked={owner === viewer}
              data-testid="owner-me"
              onClick={() => setOwner(viewer)}
              className={cn(
                "rounded-full border px-3 py-2 text-[13px] font-medium transition-colors",
                owner === viewer
                  ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                  : "border-hairline bg-surface text-body hover:bg-canvas-soft"
              )}
            >
              나
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={owner === "together"}
              data-testid="owner-together"
              onClick={() => setOwner("together")}
              className={cn(
                "rounded-full border px-3 py-2 text-[13px] font-medium transition-colors",
                owner === "together"
                  ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                  : "border-hairline bg-surface text-body hover:bg-canvas-soft"
              )}
            >
              함께
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-canvas-soft px-3 py-2.5">
          <span className="text-[13px] font-medium text-body">종일</span>
          <Switch
            checked={allDay}
            onCheckedChange={setAllDay}
            label="종일"
            testId="switch-allday"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              className="text-[12px] font-medium text-muted"
              htmlFor="event-start-date"
            >
              시작
            </label>
            <DateField
              label="시작"
              testId="field-start-date"
              value={startDate}
              onChange={setStartDate}
              className={cn("mt-1", isLunar && "hidden")}
            />
            {isLunar && (
              <div className="mt-1 flex h-9 items-center rounded-lg border border-hairline bg-canvas-soft px-2.5 text-[13px] text-body tabular-nums">
                음력 {lunar.year}. {lunar.month}. {lunar.day}.
                {lunar.leap ? " (윤달)" : ""}
              </div>
            )}
            {!allDay && (
              <Select
                items={timeSlots.map((time) => ({ value: time, label: time }))}
                value={startTime}
                onValueChange={(value) => value != null && setStartTime(String(value))}
              >
                <SelectTrigger className="mt-1 w-full" aria-label="시작 시각">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!(isLunar || multiDate) && (
            <div>
              <label
                className="text-[12px] font-medium text-muted"
                htmlFor="event-end-date"
              >
                종료
              </label>
              <DateField
                label="종료"
                testId="field-end-date"
                value={endDate}
                min={startDate}
                onChange={setEndDate}
                className="mt-1"
              />
              {!allDay && (
                <Select
                  items={timeSlots.map((time) => ({ value: time, label: time }))}
                  value={endTime}
                  onValueChange={(value) => value != null && setEndTime(String(value))}
                >
                  <SelectTrigger className="mt-1 w-full" aria-label="종료 시각">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
        {endBeforeStart && (
          <p className="-mt-2 text-[11px] text-destructive">
            종료 시각이 시작 시각보다 빠릅니다.
          </p>
        )}

        {settings.lunarEvent && (
          <div className="rounded-xl bg-canvas-soft p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-body">음력</span>
              <Switch checked={isLunar} onCheckedChange={toggleLunar} label="음력" />
            </div>
            {isLunar && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-end gap-2">
                  <div>
                    <label className="text-[12px] font-medium text-muted">음력 연</label>
                    <Select
                      items={lunarYears.map((year) => ({
                        value: year,
                        label: `${year}년`,
                      }))}
                      value={lunar.year}
                      onValueChange={(value) =>
                        value != null &&
                        setLunar((prev) => ({ ...prev, year: Number(value) }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full" aria-label="음력 연">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lunarYears.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}년
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-muted">월</label>
                    <Select
                      items={lunarMonths.map((month) => ({
                        value: month,
                        label: `${month}월`,
                      }))}
                      value={lunar.month}
                      onValueChange={(value) =>
                        value != null &&
                        setLunar((prev) => ({ ...prev, month: Number(value) }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full" aria-label="음력 월">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lunarMonths.map((month) => (
                          <SelectItem key={month} value={month}>
                            {month}월
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-muted">일</label>
                    <Select
                      items={lunarDays.map((day) => ({ value: day, label: `${day}일` }))}
                      value={lunar.day}
                      onValueChange={(value) =>
                        value != null &&
                        setLunar((prev) => ({ ...prev, day: Number(value) }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full" aria-label="음력 일">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lunarDays.map((day) => (
                          <SelectItem key={day} value={day}>
                            {day}일
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-1 pb-1 text-[12px] text-muted">
                    <input
                      type="checkbox"
                      checked={lunar.leap}
                      onChange={(event) =>
                        setLunar((prev) => ({ ...prev, leap: event.target.checked }))
                      }
                    />
                    윤달
                  </label>
                </div>
                <p className="text-[12px] text-muted">
                  {lunarLoading
                    ? "양력 날짜를 계산하고 있어요."
                    : solarDate
                      ? `양력 ${kst(solarDate).format("YYYY. MM. DD.")}`
                      : "유효하지 않은 음력 날짜예요."}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-[12px] font-medium text-muted">반복</label>
          <Select
            items={recurrenceOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={recurrence}
            onValueChange={(value) =>
              value != null && setRecurrence(value as CalendarRecurrence)
            }
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
              <label
                className="text-[12px] font-medium text-muted"
                htmlFor="event-recurrence-until"
              >
                반복 종료일(선택)
              </label>
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
          <div className="rounded-xl bg-canvas-soft p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-body">여러 날짜</span>
              <Switch
                checked={multiDate}
                onCheckedChange={toggleMultiDate}
                label="여러 날짜"
                disabled={isLunar}
              />
            </div>
            {multiDate && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {dates.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[12px]"
                    >
                      {kst(item).format("M.D")}
                      <button
                        type="button"
                        aria-label={`${item} 날짜 삭제`}
                        onClick={() => removeDate(item)}
                        className="text-muted hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <DateField
                    label="날짜 추가"
                    testId="field-multidate"
                    value={dateDraft}
                    onChange={setDateDraft}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addDate}
                    disabled={!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)}
                  >
                    추가
                  </Button>
                </div>
                {datesEmpty && (
                  <p className="text-[11px] text-destructive">
                    날짜를 하나 이상 선택해 주세요.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-medium text-muted">라벨</p>
            <Button type="button" variant="ghost" size="sm" onClick={onManageLabels}>
              라벨 관리
            </Button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 pb-1">
            <button
              type="button"
              aria-pressed={labelId === null}
              onClick={() => setLabelId(null)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                labelId === null
                  ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                  : "border-hairline bg-surface text-body hover:bg-canvas-soft"
              )}
            >
              없음
            </button>
            {labels.map((label) => {
              const selected = label.id === labelId;
              return (
                <button
                  key={label.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setLabelId(selected ? null : label.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                    selected
                      ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                      : "border-hairline bg-surface text-body hover:bg-canvas-soft"
                  )}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: labelColor(label.color) }}
                  />
                  {label.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted" htmlFor="event-location">
            위치
          </label>
          <Input
            id="event-location"
            data-testid="field-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="예: 성수동 카페"
            autoComplete="off"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted" htmlFor="event-memo">
            메모
          </label>
          <Textarea
            id="event-memo"
            data-testid="field-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
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

      <div className="-mx-4 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-hairline bg-popover px-4 py-3">
        {event && confirmDelete ? (
          <div className="flex w-full items-center gap-2 text-[12px] text-destructive">
            <span className="flex-1">정말 지울까요?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => removeEvent.mutate()}
              disabled={removeEvent.isPending}
            >
              지우기
            </Button>
          </div>
        ) : (
          <>
            <div>
              {event && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="btn-delete-event"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
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
          </>
        )}
      </div>
    </form>
  );
};
