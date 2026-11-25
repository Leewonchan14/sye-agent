"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Segmented, Switch } from "@/components/calendar/calendar-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { calendarRequest } from "@/lib/calendar/client";
import { useCalendarSettings, useInvalidateCalendar } from "@/lib/calendar/hooks";
import type { CalendarSettings } from "@/lib/calendar/types";

const MINUTE_STEPS = [1, 5, 10, 15, 30, 60];

const SwitchRow = ({
  label,
  hint,
  checked,
  testId,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  testId: string;
  onChange: (value: boolean) => void;
}) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5">
    <div className="min-w-0">
      <p className="text-[13px] text-ink">{label}</p>
      {hint && <p className="text-[11px] text-muted-soft">{hint}</p>}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} label={label} testId={testId} />
  </div>
);

const WEEK_START_OPTIONS: { value: 0 | 1; label: string }[] = [
  { value: 0, label: "일요일" },
  { value: 1, label: "월요일" },
];

export const SettingsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const invalidate = useInvalidateCalendar();
  const { data: settings, isPending, isError } = useCalendarSettings({ enabled: open });

  const patch = useMutation({
    mutationFn: (partial: Partial<CalendarSettings>) =>
      calendarRequest<{ settings: CalendarSettings }>(token, "/api/calendar/settings", {
        method: "PATCH",
        body: JSON.stringify(partial),
      }),
    onSuccess: invalidate,
    onError: () => toast.error("설정을 저장하지 못했어요"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="settings-dialog"
        className="max-h-[85dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>캘린더 설정</DialogTitle>
          <DialogDescription>구독과 표시 방식을 골라요</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="grid place-items-center py-10">
            <Spinner className="text-primary" />
          </div>
        ) : isError || !settings ? (
          <p className="py-10 text-center text-[13px] text-muted">
            설정을 불러오지 못했어요
          </p>
        ) : (
          <div className="space-y-1.5">
            <SwitchRow
              label="대한민국 공휴일"
              checked={settings.showHolidays}
              testId="setting-holidays"
              onChange={(value) => patch.mutate({ showHolidays: value })}
            />
            <SwitchRow
              label="사진 표시"
              checked={settings.showPhotos}
              testId="setting-photos"
              onChange={(value) => patch.mutate({ showPhotos: value })}
            />

            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5">
              <p className="text-[13px] text-ink">시작 요일</p>
              <Segmented
                testId="setting-week-start"
                options={WEEK_START_OPTIONS}
                value={settings.weekStart}
                onChange={(weekStart) => patch.mutate({ weekStart })}
                className="bg-canvas-soft"
              />
            </div>

            <SwitchRow
              label="휴일·주말 강조"
              checked={settings.highlightWeekend}
              testId="setting-highlight"
              onChange={(value) => patch.mutate({ highlightWeekend: value })}
            />

            <SwitchRow
              label="음력 상세 표시"
              checked={settings.lunarDetail}
              testId="setting-lunar-detail"
              onChange={(value) => patch.mutate({ lunarDetail: value })}
            />
            <SwitchRow
              label="월 캘린더 음력"
              checked={settings.lunarMonth}
              testId="setting-lunar-month"
              onChange={(value) => patch.mutate({ lunarMonth: value })}
            />
            <SwitchRow
              label="일정 등록 음력 옵션"
              checked={settings.lunarEvent}
              testId="setting-lunar-event"
              onChange={(value) => patch.mutate({ lunarEvent: value })}
            />

            <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5">
              <p className="text-[13px] text-ink">시간 입력 단위</p>
              <Select
                items={MINUTE_STEPS.map((step) => ({
                  value: String(step),
                  label: `${step}분`,
                }))}
                value={String(settings.minuteStep)}
                onValueChange={(value) => {
                  if (value) patch.mutate({ minuteStep: Number(value) });
                }}
              >
                <SelectTrigger
                  data-testid="setting-minute-step"
                  aria-label="시간 입력 단위"
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {MINUTE_STEPS.map((step) => (
                    <SelectItem key={step} value={String(step)}>
                      {step}분
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SwitchRow
              label="Plus 기능"
              hint="일기 페이지"
              checked={settings.plus}
              testId="setting-plus"
              onChange={(value) => patch.mutate({ plus: value })}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
