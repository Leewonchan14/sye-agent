"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { DateField } from "@/components/calendar/date-field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ownerName } from "@/lib/calendar/format";
import { labelColor } from "@/lib/calendar/labels";
import type { CalendarLabel, CalendarOwner, LunarDate } from "@/lib/calendar/types";
import { isIsoDate } from "@/lib/calendar/view";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

/** 일정 폼의 작은 입력 묶음. 상태는 EventForm이 갖고 여기서는 그리기만 한다. */

const CHOICE_CLASS =
  "border-hairline bg-surface text-body transition-colors hover:bg-canvas-soft";
const CHOICE_SELECTED_CLASS =
  "border-primary bg-canvas-card text-ink ring-1 ring-primary hover:bg-canvas-card";

export const FieldLabel = ({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) => (
  <label className="text-[12px] font-medium text-muted" htmlFor={htmlFor}>
    {children}
  </label>
);

export const ErrorText = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <p className={cn("text-[11px] text-destructive", className)}>{children}</p>;

/** 회색 바탕 위에 제목과 스위치, 켜면 아래에 펼쳐지는 내용. */
export const TogglePanel = ({
  title,
  control,
  children,
}: {
  title: string;
  control: ReactNode;
  children?: ReactNode;
}) => (
  <div className="rounded-xl bg-canvas-soft p-3">
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-body">{title}</span>
      {control}
    </div>
    {children && <div className="mt-2 space-y-2">{children}</div>}
  </div>
);

const OWNERS: CalendarOwner[] = ["wonchan", "yeeun", "together"];

export const OwnerPicker = ({
  value,
  onChange,
}: {
  value: CalendarOwner;
  onChange: (owner: CalendarOwner) => void;
}) => (
  <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="참여자">
    {OWNERS.map((owner) => {
      const selected = value === owner;
      return (
        <button
          key={owner}
          type="button"
          role="radio"
          aria-checked={selected}
          data-testid={`owner-${owner}`}
          onClick={() => onChange(owner)}
          className={cn(
            "rounded-lg border px-3 py-2 text-[13px] font-medium",
            CHOICE_CLASS,
            selected && CHOICE_SELECTED_CLASS
          )}
        >
          {ownerName(owner)}
        </button>
      );
    })}
  </div>
);

const LabelChip = ({
  selected,
  color,
  onClick,
  children,
}: {
  selected: boolean;
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px]",
      CHOICE_CLASS,
      selected && CHOICE_SELECTED_CLASS
    )}
  >
    {color && (
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
    )}
    {children}
  </button>
);

export const LabelPicker = ({
  labels,
  value,
  onChange,
  onManage,
}: {
  labels: CalendarLabel[];
  value: number | null;
  onChange: (labelId: number | null) => void;
  onManage: () => void;
}) => (
  <div>
    <div className="flex items-center justify-between">
      <FieldLabel>라벨</FieldLabel>
      <Button type="button" variant="ghost" size="sm" onClick={onManage}>
        라벨 관리
      </Button>
    </div>
    <div className="mt-1 flex flex-wrap gap-1.5 pb-1">
      <LabelChip selected={value === null} onClick={() => onChange(null)}>
        없음
      </LabelChip>
      {labels.map((label) => {
        const selected = label.id === value;
        return (
          <LabelChip
            key={label.id}
            selected={selected}
            color={labelColor(label.color)}
            onClick={() => onChange(selected ? null : label.id)}
          >
            {label.name}
          </LabelChip>
        );
      })}
    </div>
  </div>
);

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const LUNAR_PARTS = [
  {
    key: "year",
    label: "음력 연",
    aria: "음력 연",
    unit: "년",
    values: range(1900, 2050),
  },
  { key: "month", label: "월", aria: "음력 월", unit: "월", values: range(1, 12) },
  { key: "day", label: "일", aria: "음력 일", unit: "일", values: range(1, 30) },
] as const;

/** 음력 연·월·일·윤달 고르기와, 그 날짜의 양력 미리보기. */
export const LunarDatePicker = ({
  value,
  onChange,
  solarDate,
  loading,
}: {
  value: LunarDate;
  onChange: (value: LunarDate) => void;
  solarDate: string | null;
  loading: boolean;
}) => (
  <>
    <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-end gap-2">
      {LUNAR_PARTS.map((part) => (
        <div key={part.key}>
          <FieldLabel>{part.label}</FieldLabel>
          <Select
            items={part.values.map((n) => ({ value: n, label: `${n}${part.unit}` }))}
            value={value[part.key]}
            onValueChange={(next) => {
              if (next != null) onChange({ ...value, [part.key]: Number(next) });
            }}
          >
            <SelectTrigger className="mt-1 w-full" aria-label={part.aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {part.values.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                  {part.unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      <label className="flex items-center gap-1 pb-1 text-[12px] text-muted">
        <input
          type="checkbox"
          checked={value.leap}
          onChange={(event) => onChange({ ...value, leap: event.target.checked })}
        />
        윤달
      </label>
    </div>
    <p className="text-[12px] text-muted">
      {loading && "양력 날짜를 계산하고 있어요."}
      {!loading && solarDate && `양력 ${kst(solarDate).format("YYYY. MM. DD.")}`}
      {!loading && !solarDate && "유효하지 않은 음력 날짜예요."}
    </p>
  </>
);

/** 같은 일정을 여러 날짜에 한 번에 만들 때 날짜 목록. */
export const MultiDatePicker = ({
  dates,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  dates: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (date: string) => void;
}) => (
  <>
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
            onClick={() => onRemove(item)}
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
        value={draft}
        onChange={onDraftChange}
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        disabled={!isIsoDate(draft)}
      >
        추가
      </Button>
    </div>
    {dates.length === 0 && <ErrorText>날짜를 하나 이상 선택해 주세요.</ErrorText>}
  </>
);
