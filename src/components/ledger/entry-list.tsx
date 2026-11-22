"use client";

import { EntryIcon } from "@/components/ledger/category-icon";
import { MapLinkButton } from "@/components/ledger/map-link-button";
import type { LedgerEntryView } from "@/lib/db/ledger";
import { formatWon } from "@/lib/ledger/format";

export type { LedgerEntryView };

interface RowProps {
  entry: LedgerEntryView;
  onEdit: (entry: LedgerEntryView) => void;
  /** 목록에 지도 링크가 하나라도 있으면 금액 줄을 맞추려고 빈 자리를 둔다. */
  reserveMapSlot?: boolean;
}

export const LedgerEntryRow = ({ entry, onEdit, reserveMapSlot }: RowProps) => {
  const isIncome = entry.kind === "income";
  const title = entry.memo || (isIncome ? "입금" : entry.categoryName || "지출");
  const meta = [
    entry.entryTime,
    !isIncome && (entry.categoryName ?? "분류 없음"),
    entry.tripName,
    entry.tags,
  ]
    .filter(Boolean)
    .join(" · ");

  // 줄 전체가 수정 버튼이라 링크를 안에 넣을 수 없어, 지도 버튼은 옆에 따로 둔다.
  // 바깥 칸(LedgerEntryList)이 둘을 가로로 놓는다.
  return (
    <>
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-canvas-soft"
      >
        <EntryIcon entry={entry} size={36} className="rounded-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted">{meta}</span>
          {entry.note && (
            <span className="mt-0.5 block truncate text-[11px] text-muted/80">
              {entry.note}
            </span>
          )}
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
      {entry.mapUrl ? (
        <MapLinkButton
          url={entry.mapUrl}
          label={title}
          imageUrls={entry.mapImageUrls}
          showCount
          className="size-10"
        />
      ) : (
        reserveMapSlot && <span aria-hidden className="size-10 shrink-0" />
      )}
    </>
  );
};

interface ListProps {
  entries: LedgerEntryView[];
  onEdit: (entry: LedgerEntryView) => void;
  emptyText?: string;
}

export const LedgerEntryList = ({ entries, onEdit, emptyText }: ListProps) => {
  const reserveMapSlot = entries.some((entry) => entry.mapUrl);
  if (!entries.length) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-muted">
        {emptyText ?? "기록이 없어요"}
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        // 둥근 버튼에 테두리를 주면 선 끝이 휘므로, 곧은 선은 바깥 칸에 그린다.
        // left-14는 버튼 여백 + 아이콘 + 간격을 더한 글자 시작점이다.
        <div
          key={entry.id}
          className="relative flex items-center gap-1 not-last:after:absolute not-last:after:right-2 not-last:after:bottom-0 not-last:after:left-14 not-last:after:h-px not-last:after:bg-hairline"
        >
          <LedgerEntryRow entry={entry} onEdit={onEdit} reserveMapSlot={reserveMapSlot} />
        </div>
      ))}
    </div>
  );
};
