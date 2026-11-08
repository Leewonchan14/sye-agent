"use client";

import { CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/lib/db/ledger";
import { formatWon } from "@/lib/ledger/format";

export type { LedgerEntryView };

interface RowProps {
  entry: LedgerEntryView;
  onEdit: (entry: LedgerEntryView) => void;
}

export const LedgerEntryRow = ({ entry, onEdit }: RowProps) => {
  const title =
    entry.memo || entry.categoryName || (entry.kind === "income" ? "수입" : "지출");
  const meta = [entry.entryTime, entry.categoryName ?? "분류 없음", entry.tags]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onEdit(entry)}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-shadow hover:bg-canvas-soft/60 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CategoryIcon
        icon={entry.categoryIcon}
        color={entry.categoryColor}
        size={36}
        className="rounded-[10px]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{meta}</span>
      </span>
      <span
        className={`shrink-0 text-[13px] font-medium tabular-nums ${
          entry.kind === "income" ? "text-[color:var(--color-success)]" : "text-ink"
        }`}
      >
        {entry.kind === "income" ? "+" : "-"}
        {formatWon(entry.amount)}
      </span>
    </button>
  );
};

interface ListProps {
  entries: LedgerEntryView[];
  onEdit: (entry: LedgerEntryView) => void;
  emptyText?: string;
}

export const LedgerEntryList = ({ entries, onEdit, emptyText }: ListProps) => {
  if (!entries.length) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-muted">
        {emptyText ?? "기록이 없어요"}
      </p>
    );
  }

  return (
    <div className="divide-y divide-hairline-soft">
      {entries.map((entry) => (
        <LedgerEntryRow key={entry.id} entry={entry} onEdit={onEdit} />
      ))}
    </div>
  );
};
