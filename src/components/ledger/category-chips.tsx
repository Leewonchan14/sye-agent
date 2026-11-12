"use client";

import { CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { cn } from "@/lib/utils";

export type CategoryFilter = number | "all";

export const categoryChipClass = (active: boolean) =>
  cn(
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
    active && "border-primary/30 bg-primary/10 text-primary",
    !active && "border-hairline bg-surface text-muted hover:text-ink"
  );

/** 여행에 묶인 내역을 빼고 보는 토글. 내역·달력·통계 탭이 같은 값을 함께 쓴다. */
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
