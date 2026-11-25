"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { calendarKeys, calendarRequest } from "@/lib/calendar/client";
import type { CalendarSettings } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";

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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "border-primary bg-primary" : "border-hairline bg-canvas-strong"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
          checked ? "left-4" : "left-0.5"
        )}
      />
    </button>
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
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery({
    queryKey: calendarKeys.settings,
    queryFn: async () => {
      const res = await calendarRequest<{ settings: CalendarSettings }>(
        token,
        "/api/calendar/settings"
      );
      return res.settings;
    },
    enabled: open && Boolean(token),
  });

  const patch = useMutation({
    mutationFn: (partial: Partial<CalendarSettings>) =>
      calendarRequest<{ settings: CalendarSettings }>(token, "/api/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar"] }),
    onError: () => toast.error("설정을 저장하지 못했어요"),
  });

  const settings = data;

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
              <div
                data-testid="setting-week-start"
                role="group"
                className="flex items-center rounded-lg border border-hairline bg-canvas-soft p-0.5"
              >
                {WEEK_START_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={settings.weekStart === option.value}
                    onClick={() => patch.mutate({ weekStart: option.value })}
                    className={cn(
                      "rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
                      settings.weekStart === option.value &&
                        "bg-primary text-primary-foreground",
                      settings.weekStart !== option.value && "text-muted hover:text-ink"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
              hint="일기 모아보기·일기 페이지"
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
