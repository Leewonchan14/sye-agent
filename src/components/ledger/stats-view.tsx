"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { formatWon, LEDGER_MEMBERS, memberBar, memberName } from "@/lib/ledger/members";

interface Props {
  ledger: LedgerMonthPayload;
  onOpenSettings: () => void;
}

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

const ProgressBar = ({ pct, className = "" }: { pct: number; className?: string }) => (
  <div className={`h-1.5 overflow-hidden rounded-full bg-canvas-soft ${className}`}>
    <div
      className="h-full rounded-full bg-primary transition-[width]"
      style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
    />
  </div>
);

export const StatsView = ({ ledger, onOpenSettings }: Props) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [note, setNote] = useState(ledger.budget.note);

  const { totalBudget, byCategory: categoryBudgets } = ledger.budget;
  const { income, expense, byMember, settlement, budgetRemaining, budgetUsedPct } =
    ledger.summary;
  const totalPaid = byMember.wonchan + byMember.yeeun;

  const saveNote = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ledger/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify({
          month: ledger.month,
          totalBudget,
          note,
          categories: categoryBudgets,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("메모를 저장했어요.");
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0 md:col-span-2">
        <CardContent className="px-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-muted">이번 달 예산</p>
            <span className="text-[11px] text-muted-soft tabular-nums">
              {totalBudget == null
                ? ""
                : `지출 ${formatWon(expense)} / ${formatWon(totalBudget)}`}
            </span>
          </div>

          {totalBudget == null ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-muted">예산을 정하면 진행률을 보여줄게요</p>
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                예산 정하기
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span
                  className={`text-lg font-semibold tabular-nums ${
                    budgetRemaining != null && budgetRemaining < 0
                      ? "text-[color:var(--color-error)]"
                      : "text-ink"
                  }`}
                >
                  {formatWon(budgetRemaining ?? 0)}
                  <span className="ml-1 text-[12px] font-normal">
                    {budgetRemaining != null && budgetRemaining >= 0 ? "남은 돈" : "초과"}
                  </span>
                </span>
                <span
                  className={`text-[12px] font-medium tabular-nums ${
                    budgetRemaining != null && budgetRemaining < 0
                      ? "text-[color:var(--color-error)]"
                      : "text-muted"
                  }`}
                >
                  {budgetUsedPct ?? 0}% 사용
                </span>
              </div>
              <ProgressBar pct={budgetUsedPct ?? 0} className="mt-2" />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
        <CardContent className="px-4">
          <p className="text-[12px] font-medium text-muted">분류별 지출</p>
          {ledger.byCategory.length ? (
            <ul className="mt-2 divide-y divide-hairline-soft">
              {ledger.byCategory.map((category) => (
                <li key={category.categoryId ?? "none"} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
                      <span aria-hidden>{category.emoji}</span>
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-body tabular-nums">
                      {formatWon(category.amount)}
                      <span className="ml-1 text-muted">{category.pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-canvas-soft">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(category.pct, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-muted">이번 달 지출이 아직 없어요</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
        <CardContent className="px-4">
          <p className="text-[12px] font-medium text-muted">결제수단별 지출</p>
          {ledger.byAsset.length ? (
            <ul className="mt-2 divide-y divide-hairline-soft">
              {ledger.byAsset.map((asset) => (
                <li
                  key={asset.assetId ?? "none"}
                  className="flex items-center justify-between gap-2 py-2 text-[13px]"
                >
                  <span className="truncate text-body">{asset.name}</span>
                  <span className="shrink-0 font-medium text-ink tabular-nums">
                    {formatWon(asset.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-muted">이번 달 지출이 아직 없어요</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
        <CardContent className="px-4">
          <p className="text-[12px] font-medium text-muted">함께 쓰는 돈</p>
          <div className="mt-2 space-y-2.5">
            {LEDGER_MEMBERS.map((member) => {
              const paid = byMember[member.id];
              const share = totalPaid ? (paid / totalPaid) * 100 : 0;
              return (
                <div key={member.id}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-body">{member.name}</span>
                    <span className="font-medium text-ink tabular-nums">
                      {formatWon(paid)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas-soft">
                    <div
                      className={`h-full rounded-full ${memberBar(member.id)}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {settlement.amount > 0 && settlement.from && settlement.to ? (
            <div className="mt-3 border-t border-hairline-soft pt-2">
              <p className="text-[13px] font-medium text-ink">
                {memberName(settlement.from)} → {memberName(settlement.to)}{" "}
                {formatWon(settlement.amount)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                이번 달 지출을 반씩 나누면 이렇게 정산해요
              </p>
            </div>
          ) : (
            <p className="mt-3 border-t border-hairline-soft pt-2 text-[13px] text-muted">
              정산할 금액이 없어요
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0 md:col-span-2">
        <CardContent className="px-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-muted">이번 달 메모</p>
            <span className="text-[11px] text-muted-soft tabular-nums">
              수입 {formatWon(income)}
            </span>
          </div>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="이번 달에 기억해 둘 것"
            className="mt-2 min-h-20"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => saveNote.mutate()}
              disabled={saveNote.isPending || note.trim() === ledger.budget.note}
            >
              메모 저장
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
