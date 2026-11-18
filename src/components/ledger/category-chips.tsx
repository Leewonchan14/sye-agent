"use client";

import { CategoryIcon } from "@/components/ledger/category-icon";
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

const TRIP_SCOPE_CHIPS: { scope: Exclude<TripScope, "all">; label: string }[] = [
  { scope: "exclude", label: "여행 제외" },
  { scope: "only", label: "여행만" },
];

/**
 * 내역·달력 탭의 여행 범위 칩. 둘 중 하나만 켜지고, 켜진 칩을 다시 누르면 전체로 돌아간다.
 */
export const TripScopeChips = ({
  value,
  onChange,
}: {
  value: TripScope;
  onChange: (value: TripScope) => void;
}) => (
  <div role="group" aria-label="여행 내역 보기" className="flex items-center gap-1">
    {TRIP_SCOPE_CHIPS.map(({ scope, label }) => (
      <button
        key={scope}
        type="button"
        aria-pressed={value === scope}
        onClick={() => onChange(value === scope ? "all" : scope)}
        className={categoryChipClass(value === scope)}
      >
        {label}
      </button>
    ))}
  </div>
);

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
