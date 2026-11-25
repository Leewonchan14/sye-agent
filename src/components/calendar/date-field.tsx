"use client";

import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 한국어로 읽히는 날짜 고르기. 네이티브 date input은 브라우저 로케일에 따라
 * `11/04/2026`처럼 미국식으로 보여서, 앱 안의 달력 팝오버로 통일한다.
 * 값은 `YYYY-MM-DD`.
 */
export const DateField = ({
  value,
  onChange,
  label,
  min,
  max,
  className,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: string;
  max?: string;
  className?: string;
  testId?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISO(value) : undefined;
  const from = min ? parseISO(min) : undefined;
  const to = max ? parseISO(max) : undefined;
  const disabled: Array<{ before: Date } | { after: Date }> = [];
  if (from) disabled.push({ before: from });
  if (to) disabled.push({ after: to });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            data-testid={testId}
            aria-label={label ? `${label} 날짜` : "날짜"}
            className={cn(
              "h-9 w-full justify-start gap-2 px-2.5 text-left text-[13px] font-normal text-ink",
              className
            )}
          />
        }
      >
        <CalendarDays className="size-3.5 shrink-0 text-muted" />
        <span className="truncate tabular-nums">
          {selected ? format(selected, "yyyy. M. d. (EEE)", { locale: ko }) : "날짜 선택"}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          locale={ko}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          disabled={disabled.length ? disabled : undefined}
          onSelect={(day) => {
            if (!day) return;
            onChange(format(day, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
