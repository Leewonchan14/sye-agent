"use client";

import { DateField } from "@/components/calendar/date-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * shadcn "Date and Time picker" 구성(달력 팝오버 + 시각 입력)을 이 다이얼로그 크기에 맞춘 것.
 * 날짜는 `YYYY-MM-DD`, 시각은 `HH:mm`으로 따로 주고받는다.
 */
export const DateTimeField = ({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
  minDate,
  invalid = false,
  hideTime = false,
  testId,
  className,
}: {
  label: string;
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  /** 고를 수 있는 첫 날(YYYY-MM-DD) */
  minDate?: string;
  invalid?: boolean;
  /** 종일 일정처럼 시각을 고를 필요가 없을 때 */
  hideTime?: boolean;
  testId?: string;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-1", className)}>
    <span className="text-[12px] font-medium text-muted">{label}</span>
    <div className="flex min-w-0 flex-col gap-1.5">
      <DateField
        label={label}
        testId={testId}
        value={date}
        min={minDate}
        invalid={invalid}
        onChange={onDateChange}
        className="text-[12px]"
      />
      {!hideTime && (
        <Input
          type="time"
          aria-label={`${label} 시각`}
          aria-invalid={invalid}
          value={time}
          onChange={(event) => {
            if (event.target.value) onTimeChange(event.target.value.slice(0, 5));
          }}
          className={cn(
            "h-9 w-full shrink-0 appearance-none bg-surface px-2 text-[12px] tabular-nums",
            "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          )}
        />
      )}
    </div>
  </div>
);
