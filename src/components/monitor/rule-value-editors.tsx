"use client";

import { CalendarClock, CalendarDays, X } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { ko } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayjs, kst } from "@/lib/kst";
import {
  dayLabel,
  DEFAULT_PERIOD,
  describeDuration,
  formatPeriod,
  isValidPeriod,
  MIN_PERIOD_DAY,
  type MonitorPeriod,
  parsePeriod,
  periodMinutes,
  resolvePeriod,
} from "@/lib/monitor/period";
import type { MonitorRule } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

/*
 * 달력은 브라우저 로컬 Date를 쓰므로, KST 날짜를 "연·월·일"만 같은 로컬 Date로 주고받는다.
 * 그래야 기기 시간대가 달라도 고른 날짜가 하루씩 밀리지 않는다.
 */
const todayKst = () => kst().startOf("day");
const toLocalDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fromLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
/** 고른 날짜가 오늘(KST)로부터 며칠 떨어졌는지 — 날짜 문자열끼리 비교해 시간대 영향을 없앤다. */
const offsetFromToday = (date: Date) =>
  dayjs.utc(fromLocalDate(date)).diff(dayjs.utc(todayKst().format("YYYY-MM-DD")), "day");
const localDateAt = (offset: number) =>
  toLocalDate(todayKst().add(offset, "day").format("YYYY-MM-DD"));

export const RuleSwitch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative h-[22px] w-[38px] shrink-0 rounded-full bg-canvas-strong transition-colors",
      checked && "bg-primary"
    )}
  >
    <span
      className={cn(
        "absolute top-[3px] left-[3px] size-4 rounded-full bg-surface transition-[left]",
        checked && "left-[19px]"
      )}
    />
  </button>
);

export const TagsEditor = ({
  value,
  onChange,
  label,
  align = "end",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  align?: "start" | "end";
}) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tags = draft
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !value.includes(t));
    if (tags.length) onChange([...value, ...new Set(tags)]);
    setDraft("");
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        align === "end" && "sm:justify-end"
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-canvas-card pr-1 pl-2.5 text-[13px]"
        >
          {tag}
          <button
            type="button"
            aria-label={`${tag} 삭제`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="grid size-5 place-items-center rounded-full text-muted hover:bg-canvas-strong hover:text-ink"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="추가 후 Enter"
        aria-label={`${label}에 추가`}
        className="h-7 w-28 text-[13px]"
      />
    </div>
  );
};

const TimeField = ({
  label,
  day,
  time,
  onTime,
}: {
  label: string;
  day: number;
  time: string;
  onTime: (v: string) => void;
}) => (
  <label className="flex items-center justify-between gap-2 text-[13px] text-muted">
    <span className="flex items-center gap-1.5">
      {label}
      <span className="rounded-full bg-canvas-card px-2 py-0.5 text-xs text-body-strong">
        {dayLabel(day)}
      </span>
    </span>
    <Input
      type="time"
      step={600}
      value={time}
      onChange={(e) => e.target.value && onTime(e.target.value)}
      aria-label={`${label} 시각`}
      className="h-8 w-[136px] font-mono text-[13px] tabular-nums"
    />
  </label>
);

/**
 * "모니터링 기간"(매일 도는 수집의 시간대) 고르기.
 * 오늘을 기준으로 달력에서 시작·끝 날짜를 고르면 "전일 / 당일" 간격으로 저장된다.
 */
export const PeriodPicker = ({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) => {
  const current = parsePeriod(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MonitorPeriod>(current ?? DEFAULT_PERIOD);

  const valid = isValidPeriod(draft);
  const resolved = resolvePeriod(draft);
  const fmt = (d: ReturnType<typeof kst>) => d.format("M.D (dd) HH:mm");
  const range: DateRange = {
    from: localDateAt(draft.startDay),
    to: localDateAt(draft.endDay),
  };

  const onSelect = (next: DateRange | undefined) => {
    if (!next?.from) return;
    const startDay = offsetFromToday(next.from);
    const endDay = offsetFromToday(next.to ?? next.from);
    setDraft((d) => ({ ...d, startDay, endDay }));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(current ?? DEFAULT_PERIOD);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-label={`${label}: ${value || "설정 안 됨"}`}
            className={cn(
              "justify-start font-normal aria-expanded:bg-canvas-card aria-expanded:text-ink",
              className
            )}
          />
        }
      >
        <CalendarClock className="text-primary" />
        <span className="tabular-nums">
          {current ? formatPeriod(current) : "시간대 고르기"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[296px] gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted">
            오늘을 기준으로 시작·끝 날짜를 고르세요. 매일 같은 간격으로 수집해요.
          </p>
        </div>
        <Calendar
          mode="range"
          locale={ko}
          selected={range}
          onSelect={onSelect}
          defaultMonth={localDateAt(0)}
          disabled={[{ after: localDateAt(0) }, { before: localDateAt(MIN_PERIOD_DAY) }]}
          className="mx-auto p-0"
        />
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <TimeField
            label="시작"
            day={draft.startDay}
            time={draft.startTime}
            onTime={(startTime) => setDraft((d) => ({ ...d, startTime }))}
          />
          <TimeField
            label="끝"
            day={draft.endDay}
            time={draft.endTime}
            onTime={(endTime) => setDraft((d) => ({ ...d, endTime }))}
          />
        </div>
        <p
          className={cn(
            "rounded-md bg-canvas-soft px-2.5 py-2 text-xs text-body",
            !valid && "text-error"
          )}
          aria-live="polite"
        >
          {valid ? (
            <>
              오늘 돌리면{" "}
              <span className="text-ink tabular-nums">
                {fmt(resolved.since)} ~ {fmt(resolved.until)}
              </span>{" "}
              · {describeDuration(periodMinutes(draft))}
            </>
          ) : (
            "끝 시각이 시작 시각보다 늦어야 해요."
          )}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              onChange(formatPeriod(draft));
              setOpen(false);
            }}
          >
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const DatePicker = ({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const selected = valid ? toLocalDate(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-label={`${label}: ${value || "날짜 없음"}`}
            className={cn(
              "justify-start font-normal aria-expanded:bg-canvas-card aria-expanded:text-ink",
              className
            )}
          />
        }
      >
        <CalendarDays className="text-primary" />
        <span className="tabular-nums">
          {valid ? kst(value).format("YYYY.MM.DD (dd)") : "날짜 고르기"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <Calendar
          mode="single"
          locale={ko}
          selected={selected}
          defaultMonth={selected ?? localDateAt(0)}
          onSelect={(date) => {
            if (!date) return;
            onChange(fromLocalDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

/**
 * 규칙 종류에 맞는 값 편집기.
 * live면 입력할 때마다 onChange(다이얼로그), 아니면 입력을 마쳤을 때 저장(목록).
 */
export const RuleValueEditor = ({
  rule,
  onChange,
  live = false,
  align = "end",
}: {
  rule: Pick<MonitorRule, "kind" | "value" | "title">;
  onChange: (value: MonitorRule["value"]) => void;
  live?: boolean;
  align?: "start" | "end";
}) => {
  const label = rule.title || "규칙";
  switch (rule.kind) {
    case "toggle":
      return (
        <RuleSwitch checked={rule.value === true} label={label} onChange={onChange} />
      );
    case "tags":
      return (
        <TagsEditor
          value={Array.isArray(rule.value) ? rule.value : []}
          label={label}
          align={align}
          onChange={onChange}
        />
      );
    case "period":
      return (
        <PeriodPicker
          value={String(rule.value ?? "")}
          label={label}
          onChange={onChange}
          className="w-full sm:w-auto"
        />
      );
    case "date":
      return (
        <DatePicker
          value={String(rule.value ?? "")}
          label={label}
          onChange={onChange}
          className="w-full sm:w-auto"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          min={0}
          max={100}
          aria-label={label}
          className="h-8 w-20"
          {...(live
            ? {
                value: Number(rule.value) || 0,
                onChange: (e) => onChange(Number(e.target.value) || 0),
              }
            : {
                defaultValue: Number(rule.value) || 0,
                onBlur: (e) => {
                  const next = Number(e.target.value) || 0;
                  if (next !== rule.value) onChange(next);
                },
              })}
        />
      );
    default:
      return (
        <Input
          aria-label={label}
          className={cn("h-8 w-full", align === "end" && "sm:w-56")}
          {...(live
            ? {
                value: String(rule.value ?? ""),
                onChange: (e) => onChange(e.target.value),
              }
            : {
                defaultValue: String(rule.value ?? ""),
                onBlur: (e) => {
                  if (e.target.value !== rule.value) onChange(e.target.value);
                },
              })}
        />
      );
  }
};
