"use client";

import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * shadcn "Date and Time picker" 구성(달력 팝오버 + 시각 입력)을 따른 날짜·시각 고르기.
 * 값은 KST 기준 `YYYY-MM-DDTHH:mm` 문자열이다.
 */
export const DateTimePicker = ({
  label,
  value,
  onChange,
  max,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 고를 수 있는 마지막 날(YYYY-MM-DD) */
  max?: string;
  invalid?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [date = "", time = "00:00"] = value.split("T");
  const selected = date ? parseISO(date) : undefined;
  const maxDate = max ? parseISO(max) : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] text-muted">{label}</span>
      <div className="flex min-w-0 gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                aria-label={`${label} 날짜`}
                aria-invalid={invalid}
                className="h-8 min-w-0 flex-1 justify-between gap-1 px-2 text-[12px] font-normal text-ink tabular-nums"
              />
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0 text-muted" />
              <span className="truncate">
                {selected ? format(selected, "yyyy.MM.dd (EEE)", { locale: ko }) : "날짜"}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              locale={ko}
              selected={selected}
              defaultMonth={selected}
              captionLayout="dropdown"
              startMonth={new Date(2015, 0)}
              endMonth={maxDate ?? new Date(new Date().getFullYear() + 5, 11)}
              disabled={maxDate ? { after: maxDate } : undefined}
              onSelect={(day) => {
                if (!day) return;
                onChange(`${format(day, "yyyy-MM-dd")}T${time}`);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          aria-label={`${label} 시각`}
          aria-invalid={invalid}
          value={time}
          onChange={(event) => {
            if (!date || !event.target.value) return;
            onChange(`${date}T${event.target.value.slice(0, 5)}`);
          }}
          className={cn(
            "h-8 w-[5.75rem] shrink-0 appearance-none bg-surface px-2 text-[12px] tabular-nums",
            "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          )}
        />
      </div>
    </div>
  );
};
