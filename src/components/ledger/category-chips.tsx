"use client";

import { Plane, X } from "lucide-react";

import { CategoryIcon } from "@/components/ledger/category-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import type { TripScope } from "@/lib/ledger/trip-scope";
import { cn } from "@/lib/utils";

export type CategoryFilter = number | "all";

export const categoryChipClass = (active: boolean) =>
  cn(
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
    active && "border-primary/30 bg-primary/10 text-primary",
    !active && "border-hairline bg-surface text-muted hover:text-ink"
  );

/** 여행에 묶인 내역을 빼고 보는 토글. 통계 탭은 여행 리포트가 따로 있어 이것만 쓴다. */
export const ExcludeTripsChip = ({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) => (
  <button
    type="button"
    aria-pressed={value}
    onClick={() => onChange(!value)}
    className={categoryChipClass(value)}
  >
    여행 제외
  </button>
);

/** YYYY-MM-DD → M.D */
const shortDate = (date: string) =>
  `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;

/**
 * 내역·달력 탭의 여행 보기. `여행 제외`를 켜거나 여행 하나를 골라 그 여행 내역만 본다.
 * 둘은 함께 켜지지 않고, 켜진 것을 다시 누르거나 X를 누르면 전체로 돌아간다.
 */
export const TripScopePicker = ({
  trips,
  value,
  onChange,
}: {
  trips: LedgerMonthPayload["trips"];
  value: TripScope;
  onChange: (value: TripScope) => void;
}) => {
  const selectedTrip = typeof value === "number" ? value : null;
  const items = trips.map((trip) => ({
    value: String(trip.id),
    label: trip.name,
    dates: `${shortDate(trip.startDate)}~${shortDate(trip.endDate)}`,
  }));
  return (
    <div role="group" aria-label="여행 내역 보기" className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={value === "exclude"}
        onClick={() => onChange(value === "exclude" ? "all" : "exclude")}
        className={categoryChipClass(value === "exclude")}
      >
        여행 제외
      </button>
      <Select
        items={items}
        value={selectedTrip == null ? null : String(selectedTrip)}
        onValueChange={(next) => onChange(next == null ? "all" : Number(next))}
      >
        <SelectTrigger
          size="sm"
          aria-label="여행별 보기"
          className={cn(
            categoryChipClass(selectedTrip != null),
            "h-auto! max-w-44 gap-1 py-1 pr-1.5 pl-2 text-[11px]"
          )}
        >
          <Plane className="size-3" />
          <SelectValue placeholder="여행별 보기" />
        </SelectTrigger>
        <SelectContent align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
              <span className="text-[11px] text-muted tabular-nums">{item.dates}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedTrip != null && (
        <button
          type="button"
          aria-label="여행 보기 끄기"
          onClick={() => onChange("all")}
          className="grid size-6 place-items-center rounded-full text-muted hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
};

export const ExpenseCategoryChips = ({
  label,
  categories,
  selected,
  onSelect,
  className,
}: {
  label: string;
  categories: LedgerMonthPayload["categories"];
  selected: CategoryFilter;
  onSelect: (value: CategoryFilter) => void;
  className?: string;
}) => (
  <div
    role="group"
    aria-label={label}
    className={cn("flex flex-wrap gap-1.5", className)}
  >
    <button
      type="button"
      aria-pressed={selected === "all"}
      onClick={() => onSelect("all")}
      className={categoryChipClass(selected === "all")}
    >
      <CategoryIcon icon="wallet" color="neutral" size={16} />
      <span className="truncate">전체</span>
    </button>
    {categories
      .filter((category) => category.kind === "expense")
      .map((category) => (
        <button
          key={category.id}
          type="button"
          aria-pressed={selected === category.id}
          onClick={() => onSelect(category.id)}
          className={categoryChipClass(selected === category.id)}
        >
          <CategoryIcon icon={category.icon} color={category.color} size={16} />
          <span className="min-w-0 truncate">{category.name}</span>
        </button>
      ))}
  </div>
);
