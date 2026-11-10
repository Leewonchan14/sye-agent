"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { ReceiptDialog } from "@/components/ledger/receipt/receipt-dialog";
import { shortDate } from "@/components/ledger/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatMonthKo, formatWon, todayKst } from "@/lib/ledger/format";
import {
  lastCompletedRecapKey,
  type LedgerRecap,
  type LedgerRecapPeriod,
} from "@/lib/ledger/recap";
import { cn } from "@/lib/utils";

/** 끝난 기간의 수치는 내역을 고칠 때만 바뀌므로 주기적으로 다시 읽지 않는다. */
const RECAP_STALE_MS = 5 * 60 * 1000;

const TITLE = { week: "주간 리캡", month: "월간 리캡" } as const;

/** 카드 제목 옆과 영수증 제목에 쓰는 기간 이름. 이번·지난 기간은 그렇게 부른다. */
const periodNameOf = (recap: LedgerRecap, today: string): string | null => {
  if (recap.period === "week") {
    if (recap.inProgress) return "이번 주";
    if (recap.key === lastCompletedRecapKey("week", today)) return "지난주";
    return null;
  }
  if (recap.inProgress) return "이번 달";
  if (recap.key === lastCompletedRecapKey("month", today)) return "지난달";
  return monthName(recap.key, today);
};

const monthName = (month: string, today: string): string =>
  month.slice(0, 4) === today.slice(0, 4)
    ? `${Number(month.slice(5))}월`
    : formatMonthKo(month);

/** 진행 중인 기간은 앞 기간의 같은 날짜까지와 비교한다. 조사(와/과)도 함께 둔다. */
const PREVIOUS = {
  week: { done: ["전주", "와"], ongoing: ["지난주 같은 기간", "과"] },
  month: { done: ["전월", "과"], ongoing: ["지난달 같은 기간", "과"] },
} as const;

const compareText = (recap: LedgerRecap): string => {
  const [name, particle] = PREVIOUS[recap.period][recap.inProgress ? "ongoing" : "done"];
  const { expense, previousExpense: previous } = recap;
  if (previous === 0) return `${name}에는 지출 기록이 없어요`;
  const diff = expense - previous;
  if (diff === 0) return `${name}${particle} 같은 금액이에요`;
  return `${name}보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? "더 썼어요" : "덜 썼어요"}`;
};

const budgetText = (
  budget: NonNullable<LedgerRecap["budget"]>,
  today: string
): string | null => {
  const { pace, total, spent, month } = budget;
  if (pace.state === "current") {
    if (pace.status === "over") {
      return `이번 달 예산을 ${formatWon(spent - total)} 넘었어요`;
    }
    if (pace.status === "risk") {
      return `이 속도면 이번 달 예산을 ${formatWon(pace.projectedOver)} 넘어요`;
    }
    return `이번 달은 예산 안이에요 · 월말 예상 ${formatWon(pace.projected)}`;
  }
  // 아직 오지 않은 달은 말할 게 없다.
  if (month > today.slice(0, 7)) return null;
  const name = monthName(month, today);
  if (spent > total) return `${name} 예산을 ${formatWon(spent - total)} 넘었어요`;
  return `${name}은 예산 안에서 썼어요 · ${formatWon(total - spent)} 남김`;
};

interface Props {
  period: LedgerRecapPeriod;
  /** 주간이면 그 주 월요일 */
  weekStart: string;
  /** 월간이면 그 달(YYYY-MM) */
  month: string;
}

/** 내역에서 고른 주·달을 그대로 따라가는 리캡. */
export const RecapCard = ({ period, weekStart, month }: Props) => {
  const token = useAuthStore((s) => s.token);
  const key = period === "week" ? weekStart : month;
  const { data: recap, isPlaceholderData } = useQuery({
    queryKey: ledgerKeys.recap(period, key),
    queryFn: async () => {
      const { recap } = await ledgerRequest<{ recap: LedgerRecap }>(
        token,
        `/api/ledger/recap?${period}=${key}`
      );
      return recap;
    },
    enabled: Boolean(token),
    staleTime: RECAP_STALE_MS,
    // 기간을 옮기는 동안 카드가 사라졌다 나타나며 화면이 튀지 않게 한다.
    placeholderData: keepPreviousData,
  });
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (!recap || recap.expense === 0) return null;

  const today = todayKst();
  const periodName = periodNameOf(recap, today);
  const budgetLine = recap.budget && budgetText(recap.budget, today);
  const isOverPace =
    recap.budget?.pace.state === "current" && recap.budget.pace.status !== "ok";

  return (
    <section
      aria-label={[TITLE[recap.period], periodName].filter(Boolean).join(" ")}
      aria-busy={isPlaceholderData}
      className={cn("mb-3 transition-opacity", isPlaceholderData && "opacity-60")}
    >
      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
        <CardContent className="grid gap-3 px-4 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-medium text-muted">
                {TITLE[recap.period]}
                {periodName && (
                  <span className="text-muted-soft">
                    {" · "}
                    {periodName}
                    {recap.inProgress && " (진행 중)"}
                  </span>
                )}
              </p>
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
              {compareText(recap)}
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
        periodName={periodName ?? TITLE[recap.period].replace(" 리캡", "")}
        budgetLine={budgetLine || null}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </section>
  );
};
