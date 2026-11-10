"use client";

import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { ReceiptDialog } from "@/components/ledger/receipt/receipt-dialog";
import { shortDate } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon } from "@/lib/ledger/format";
import type { LedgerWeeklyRecap } from "@/lib/ledger/recap";
import { cn } from "@/lib/utils";

/** 지난주 수치는 내역을 고칠 때만 바뀌므로 주기적으로 다시 읽지 않는다. */
const RECAP_STALE_MS = 5 * 60 * 1000;

const compareText = (expense: number, previous: number): string => {
  if (previous === 0) return "전주에는 지출 기록이 없어요";
  const diff = expense - previous;
  if (diff === 0) return "전주와 같은 금액이에요";
  return `전주보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더 썼어요" : "덜 썼어요"}`;
};

const budgetText = (budget: NonNullable<LedgerWeeklyRecap["budget"]>): string | null => {
  const { pace, total, spent } = budget;
  if (pace.state !== "current") return null;
  if (pace.status === "over") {
    return `이번 달 예산을 ${formatWon(spent - total)} 넘었어요`;
  }
  if (pace.status === "risk") {
    return `이 속도면 이번 달 예산을 ${formatWon(pace.projectedOver)} 넘어요`;
  }
  return `이번 달은 예산 안이에요 · 월말 예상 ${formatWon(pace.projected)}`;
};

export const WeeklyRecapCard = () => {
  const token = useAuthStore((s) => s.token);
  const { data: recap } = useQuery({
    queryKey: ledgerKeys.recap,
    queryFn: async () => {
      const { recap } = await ledgerRequest<{ recap: LedgerWeeklyRecap }>(
        token,
        "/api/ledger/recap"
      );
      return recap;
    },
    enabled: Boolean(token),
    staleTime: RECAP_STALE_MS,
  });
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!recap || recap.expense === 0) return null;

  const budgetLine = recap.budget && budgetText(recap.budget);
  const isOverPace =
    recap.budget?.pace.state === "current" && recap.budget.pace.status !== "ok";

  return (
    <section aria-label="지난주 리캡" className="mb-3">
      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
        <CardContent className="grid gap-3 px-4 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-medium text-muted">지난주 리캡</p>
              <span className="text-[11px] text-muted-soft tabular-nums">
                {shortDate(recap.from)} ~ {shortDate(recap.to)}
              </span>
            </div>
            <p className="mt-1 text-[20px] font-semibold text-ink tabular-nums">
              {formatWon(recap.expense)}
              <span className="ml-1.5 text-[11px] font-normal text-muted">
                {recap.expenseCount}건
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-muted tabular-nums">
              {compareText(recap.expense, recap.previousExpense)}
            </p>
            {recap.comment && (
              <div className="mt-2.5 rounded-xl bg-canvas-soft/70 p-2.5">
                <p className="text-[11px] font-medium text-muted">하치와레</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink">
                  {recap.comment}
                </p>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5"
              onClick={() => setReceiptOpen(true)}
            >
              <ReceiptText />
              영수증 뽑기
            </Button>
          </div>

          <div className="min-w-0">
            <p className="text-[12px] font-medium text-muted">큰 지출</p>
            <ol className="mt-1.5 flex flex-col gap-1.5">
              {recap.topExpenses.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-ink">
                    {entry.memo || entry.categoryName || "내역"}
                  </span>
                  <span className="shrink-0 text-ink tabular-nums">
                    <span className="mr-1.5 text-[11px] text-muted-soft">
                      {shortDate(entry.date)}
                    </span>
                    {formatWon(entry.amount)}
                  </span>
                </li>
              ))}
            </ol>
            {budgetLine && (
              <p
                className={cn(
                  "mt-2.5 text-[12px] tabular-nums",
                  isOverPace && "font-medium text-[color:var(--color-error)]",
                  !isOverPace && "text-muted"
                )}
              >
                {budgetLine}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <ReceiptDialog
        recap={recap}
        budgetLine={budgetLine || null}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </section>
  );
};
