"use client";

import { ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { CalendarDayInfo, CalendarSettings } from "@/lib/calendar/types";
import { dateColorClass, weekdayLabels } from "@/lib/calendar/view";
import { cn } from "@/lib/utils";

/** 폰에서는 아래에서 올라오는 시트, sm 이상에서는 가운데 다이얼로그. */
export const SHEET_CONTENT_CLASS =
  "flex max-h-[85dvh] flex-col overflow-hidden left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-t-3xl rounded-b-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:right-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl";

/** 시트 안에서 스크롤되는 본문과 아래에 붙는 버튼 줄. */
export const SHEET_BODY_CLASS =
  "-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4";
export const SHEET_FOOTER_CLASS =
  "-mx-4 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-hairline bg-popover px-4 py-3";

/** 월간·2주 격자 맨 위 요일 줄. */
export const WeekdayHeader = ({ weekStart }: { weekStart: 0 | 1 }) => {
  const sundayIndex = weekStart === 0 ? 0 : 6;
  const saturdayIndex = weekStart === 0 ? 6 : 5;
  return weekdayLabels(weekStart).map((label, index) => (
    <div
      key={label}
      className={cn(
        "py-1 text-center text-[11px] font-medium text-muted md:text-[13px]",
        index === sundayIndex && "text-error",
        index === saturdayIndex && "text-muted-soft"
      )}
    >
      {label}
    </div>
  ));
};

/** 칸 왼쪽 위 날짜 숫자. 오늘은 동그라미로 칠한다. */
export const DayNumber = ({
  day,
  settings,
  isToday,
  className,
}: {
  day: CalendarDayInfo;
  settings: CalendarSettings;
  isToday: boolean;
  className?: string;
}) => {
  const dateNum = Number(day.date.slice(-2));
  if (isToday) {
    return (
      <span
        data-testid="today-cell"
        className="grid size-5 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground tabular-nums md:size-6 md:text-[13px]"
      >
        {dateNum}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-[12px] leading-none font-medium tabular-nums md:text-[14px]",
        dateColorClass(day, settings),
        className
      )}
    >
      {dateNum}
    </span>
  );
};

/** 일정 라벨 색 점. */
export const LabelDot = ({ color, className }: { color: string; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn("size-1.5 shrink-0 rounded-full", className)}
    style={{ background: color }}
  />
);

/**
 * 흰 테두리와 그림자를 준 폴라로이드. 여백을 폭 기준 %로 잡아 어떤 크기에서도 비율이 같다.
 * 크기와 기울기는 className으로 준다.
 */
/** 그날 일기가 있다는 표시. 사진(폴라로이드)이 안 보이는 칸에서 쓴다. */
export const DiaryMark = ({ className }: { className?: string }) => (
  <NotebookPen
    aria-hidden="true"
    data-testid="diary-mark"
    className={cn("size-3 shrink-0 text-primary md:size-3.5", className)}
  />
);

/**
 * 흰 테두리 폴라로이드. 너비는 className으로 준다.
 * 테두리를 % 패딩으로 주는데 %는 부모 너비 기준이라, 안쪽 span에 패딩을 둬서
 * 바깥 span(=폴라로이드) 너비 기준으로 계산되게 한다. 그래야 어디에 넣어도 비율이 같다.
 */
export const Polaroid = ({ src, className }: { src: string; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      "pointer-events-none block shrink-0 self-start rounded-[2px] bg-white shadow-[0_1px_4px_rgb(60_20_25/0.3)]",
      className
    )}
  >
    <span className="block p-[5%] pb-[16%]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        className="block aspect-square w-full rounded-[1px] object-cover"
      />
    </span>
  </span>
);

export const Switch = ({
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
      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-hairline bg-canvas-strong transition-colors disabled:opacity-50",
      checked && "border-primary bg-primary"
    )}
  >
    <span
      className={cn(
        "inline-block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform",
        checked && "translate-x-4.5"
      )}
    />
  </button>
);

/** 보기 방식·시작 요일·작성자처럼 몇 개 중 하나를 고르는 버튼 묶음. */
export const Segmented = <T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
  className,
}: {
  options: { value: T; label: string; testId?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  testId?: string;
  className?: string;
}) => (
  <div
    role="group"
    aria-label={ariaLabel}
    data-testid={testId}
    className={cn("flex items-center rounded-lg border border-hairline p-0.5", className)}
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected}
          data-testid={option.testId}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink",
            selected && "bg-primary text-primary-foreground hover:text-primary-foreground"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** 가운데 제목을 두고 좌우 화살표로 넘기는 줄. */
export const Stepper = ({
  children,
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  className,
}: {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}) => (
  <div className={cn("flex items-center justify-between", className)}>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={prevLabel}
      onClick={onPrev}
    >
      <ChevronLeft />
    </Button>
    {children}
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={nextLabel}
      onClick={onNext}
    >
      <ChevronRight />
    </Button>
  </div>
);
