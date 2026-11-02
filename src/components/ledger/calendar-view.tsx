"use client";

import { useState } from "react";

import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { currentMonthKst, formatCompactWon, formatDayKo, formatWon, todayKst } from "@/lib/ledger/members";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  ledger: LedgerMonthPayload;
  onEdit: (entry: LedgerEntryView) => void;
}

export const CalendarView = ({ ledger, onEdit }: Props) => {
  const today = todayKst();
  const firstDay = kst(`${ledger.month}-01`);
  const startWeekday = firstDay.day();
  const daysInMonth = firstDay.daysInMonth();

  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return `${ledger.month}-${day}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const defaultSelected =
    ledger.month === currentMonthKst() ? today : `${ledger.month}-01`;
  const [selected, setSelected] = useState<string | null>(null);
  const activeDay =
    selected && selected.startsWith(`${ledger.month}-`) ? selected : defaultSelected;

  const totalsByDate = new Map(ledger.calendar.map((day) => [day.date, day]));
  const activeTotals = totalsByDate.get(activeDay) ?? { expense: 0, income: 0 };
  const dayEntries = ledger.entries.filter((entry) => entry.entryDate === activeDay);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((label, index) => (
            <div
              key={label}
              className={`py-1 text-center text-[11px] font-medium ${
                index === 0
                  ? "text-primary"
                  : index === 6
                    ? "text-muted-soft"
                    : "text-muted"
              }`}
            >
              {label}
            </div>
          ))}

          {cells.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} />;

            const totals = totalsByDate.get(date);
            const isToday = date === today;
            const isSelected = date === activeDay;
            const weekday = index % 7;

            return (
              <button
                key={date}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${formatDayKo(date)}${totals ? `, 지출 ${formatWon(totals.expense)}` : ""}`}
                onClick={() => setSelected(date)}
                className={`flex min-h-16 flex-col items-start rounded-lg border p-1 text-left transition-colors md:min-h-20 md:p-1.5 ${
                  isSelected
                    ? "border-hairline bg-canvas-card"
                    : "border-transparent hover:bg-canvas-soft/70"
                } ${isToday ? "ring-1 ring-primary/40" : ""}`}
              >
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    weekday === 0
                      ? "text-primary"
                      : weekday === 6
                        ? "text-muted-soft"
                        : "text-body"
                  }`}
                >
                  {Number(date.slice(-2))}
                </span>
                {totals && (
                  <span className="mt-0.5 w-full space-y-0.5 overflow-hidden text-[9px] leading-tight tabular-nums md:text-[11px]">
                    {totals.expense > 0 && (
                      <span className="block truncate text-primary">
                        -{formatCompactWon(totals.expense)}
                      </span>
                    )}
                    {totals.income > 0 && (
                      <span className="block truncate text-[color:var(--color-success)]">
                        +{formatCompactWon(totals.income)}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
        <div className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-2">
          <h3 className="text-[13px] font-medium text-ink">{formatDayKo(activeDay)}</h3>
          <span className="text-[11px] text-muted tabular-nums">
            지출 {formatWon(activeTotals.expense)}
            {activeTotals.income > 0 && ` · 수입 ${formatWon(activeTotals.income)}`}
          </span>
        </div>
        <LedgerEntryList
          entries={dayEntries}
          onEdit={onEdit}
          emptyText="이 날은 기록이 없어요"
        />
      </section>
    </div>
  );
};
