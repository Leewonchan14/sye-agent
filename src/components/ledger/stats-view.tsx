"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import type { LedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import {
  formatCompactWon,
  formatWon,
  LEDGER_MEMBERS,
  memberBar,
  memberName,
  todayKst,
} from "@/lib/ledger/members";

interface Props {
  ledger: LedgerMonthPayload;
  onOpenSettings: () => void;
}

const RANGES = [
  { id: "all", label: "전체", days: 0 },
  { id: "30", label: "최근 30일", days: 30 },
  { id: "7", label: "최근 7일", days: 7 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

const CATEGORY_COLORS = [
  "#d96c75",
  "#e0a458",
  "#5aa87a",
  "#5b8def",
  "#9b7ede",
  "#8b95a1",
  "#4da3a3",
] as const;

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

const fetchStats = async (
  token: string,
  from?: string,
  to?: string
): Promise<LedgerStats> => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  const res = await fetch(`/api/ledger/stats${query ? `?${query}` : ""}`, {
    headers: { "x-auth-token": token },
  });
  if (!res.ok) throw new Error(await readError(res));

  const data = (await res.json().catch(() => null)) as { stats?: LedgerStats } | null;
  if (!data?.stats) throw new Error("통계를 불러오지 못했어요.");
  return data.stats;
};

/** 22,000 → 2.2만, 음수는 -2.2만 */
const compactWon = (value: number): string => {
  const rounded = Math.round(value);
  return rounded < 0
    ? `-${formatCompactWon(Math.abs(rounded))}`
    : formatCompactWon(rounded);
};

const StatCard = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <Card
    className={`rounded-2xl border border-hairline bg-surface py-4 ring-0 ${className}`}
  >
    <CardContent className="px-4">{children}</CardContent>
  </Card>
);

const ProgressBar = ({ pct, className = "" }: { pct: number; className?: string }) => (
  <div className={`h-1.5 overflow-hidden rounded-full bg-canvas-soft ${className}`}>
    <div
      className="h-full rounded-full bg-primary transition-[width]"
      style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
    />
  </div>
);

const KpiCards = ({ stats }: { stats: LedgerStats }) => {
  const { income, expense, net, avgDailyExpense } = stats.summary;

  return (
    <div className="grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-4">
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] font-medium text-muted">총 수입</p>
        <p className="mt-1 text-[17px] font-semibold text-[color:var(--color-success)] tabular-nums">
          {formatWon(income)}
        </p>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] font-medium text-muted">총 지출</p>
        <p className="mt-1 text-[17px] font-semibold text-primary tabular-nums">
          {formatWon(expense)}
        </p>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] font-medium text-muted">순증감</p>
        <p
          className={`mt-1 text-[17px] font-semibold tabular-nums ${
            net > 0
              ? "text-[color:var(--color-success)]"
              : net < 0
                ? "text-[color:var(--color-error)]"
                : "text-ink"
          }`}
        >
          {net > 0 ? "+" : ""}
          {formatWon(net)}
        </p>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface px-4 py-3">
        <p className="text-[11px] font-medium text-muted">하루 평균 지출</p>
        <p className="mt-1 text-[17px] font-semibold text-ink tabular-nums">
          {formatWon(avgDailyExpense)}
        </p>
      </div>
    </div>
  );
};

const BalanceCard = ({ daily }: { daily: LedgerStats["daily"] }) => {
  const width = 640;
  const height = 220;
  const left = 48;
  const right = 10;
  const top = 14;
  const bottom = 26;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const balances = daily.map((day) => day.balance);
  const rawMax = Math.max(...balances, 0);
  const niceMax = (() => {
    if (rawMax <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const step = magnitude / 2;
    return Math.ceil(rawMax / step) * step;
  })();
  const yMin = 0;
  const yMax = niceMax;
  const yRange = yMax - yMin;

  const xAt = (index: number) =>
    daily.length <= 1
      ? left + plotWidth / 2
      : left + (index / (daily.length - 1)) * plotWidth;
  const yAt = (value: number) => top + ((yMax - value) / yRange) * plotHeight;
  const baseline = top + plotHeight;
  const points = daily.map((day, index) => `${xAt(index)},${yAt(day.balance)}`);
  const firstBalance = daily[0]?.balance ?? 0;
  const linePath =
    daily.length <= 1
      ? `M ${left} ${yAt(firstBalance)} L ${left + plotWidth} ${yAt(firstBalance)}`
      : `M ${points.join(" L ")}`;
  const areaPath =
    daily.length <= 1
      ? `M ${left} ${yAt(firstBalance)} L ${left + plotWidth} ${yAt(
          firstBalance
        )} L ${left + plotWidth} ${baseline} L ${left} ${baseline} Z`
      : `M ${points.join(" L ")} L ${left + plotWidth} ${baseline} L ${left} ${baseline} Z`;

  const labelIndices = Array.from(
    new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1])
  );

  return (
    <StatCard className="md:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">잔액 추이</p>
        <p className="text-[10px] text-muted-soft">가계부 누적 잔액</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label="기간 잔액 추이"
      >
        <title>기간 잔액 추이</title>
        {[0, 1, 2, 3, 4].map((index) => {
          const y = top + (index / 4) * plotHeight;
          const value = yMax - (index / 4) * yRange;
          return (
            <g key={index}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y}
                y2={y}
                stroke="var(--color-hairline-soft)"
                strokeWidth={1}
              />
              <text
                x={left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={9}
                fill="var(--color-muted-soft)"
              >
                {compactWon(value)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="var(--color-primary)" opacity={0.12} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {daily.map((day, index) =>
          day.income > 0 ? (
            <circle
              key={day.date}
              cx={xAt(index)}
              cy={yAt(day.balance)}
              r={3}
              fill="var(--color-primary)"
              stroke="var(--color-surface)"
              strokeWidth={1.5}
            >
              <title>
                {day.date} · 수입 {formatWon(day.income)} · 잔액 {formatWon(day.balance)}
              </title>
            </circle>
          ) : null
        )}

        {labelIndices.map((index) => {
          const day = daily[index];
          if (!day) return null;
          return (
            <text
              key={`label-${day.date}`}
              x={xAt(index)}
              y={height - 8}
              textAnchor={
                index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"
              }
              fontSize={9}
              fill="var(--color-muted-soft)"
            >
              {day.date.slice(5).replace("-", ".")}
            </text>
          );
        })}
      </svg>

      <p className="mt-1 text-[10px] text-muted-soft">
        기록된 내역 기준 · 실제 통장 잔액과 다를 수 있어요
      </p>
    </StatCard>
  );
};

const DepositsCard = ({ stats }: { stats: LedgerStats }) => {
  const total = LEDGER_MEMBERS.reduce(
    (sum, member) => sum + stats.byMember[member.id].income,
    0
  );

  return (
    <StatCard>
      <p className="text-[12px] font-medium text-muted">입금자별</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {LEDGER_MEMBERS.map((member) => {
          const { income, count } = stats.byMember[member.id];
          const share = total ? (income / total) * 100 : 0;
          return (
            <div key={member.id} className="min-w-0 rounded-xl bg-canvas-soft/70 p-2.5">
              <p className="text-[11px] text-muted">{member.name}</p>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-ink tabular-nums">
                {formatWon(income)}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-soft tabular-nums">{count}건</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas-strong/60">
                <div
                  className={`h-full rounded-full ${memberBar(member.id)}`}
                  style={{ width: `${Math.max(0, Math.min(share, 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
};

const TogetherCard = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const { byMember, settlement } = ledger.summary;
  const totalPaid = byMember.wonchan + byMember.yeeun + byMember.joint;

  return (
    <StatCard>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">함께 쓰는 돈</p>
        <span className="rounded-full bg-canvas-soft px-2 py-0.5 text-[10px] text-muted">
          이번 달
        </span>
      </div>
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
                  style={{ width: `${Math.max(0, Math.min(share, 100))}%` }}
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
    </StatCard>
  );
};

const CategoryCard = ({ stats }: { stats: LedgerStats }) => {
  const total = stats.summary.expense;
  const top = stats.byCategory.slice(0, 7);
  const rest = stats.byCategory.slice(7);
  const slices = top.map((category, index) => ({
    key: category.categoryId == null ? "none" : String(category.categoryId),
    name: category.name,
    emoji: category.emoji,
    amount: category.amount,
    pct: category.pct,
    color: CATEGORY_COLORS[index] ?? CATEGORY_COLORS[5],
  }));

  if (rest.length) {
    const amount = rest.reduce((sum, category) => sum + category.amount, 0);
    slices.push({
      key: "etc",
      name: "기타",
      emoji: "🧾",
      amount,
      pct: total === 0 ? 0 : Math.round((amount / total) * 100),
      color: CATEGORY_COLORS[5],
    });
  }

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const arcs = slices.map((slice, index) => {
    const length = total === 0 ? 0 : (slice.amount / total) * circumference;
    const offset = slices
      .slice(0, index)
      .reduce(
        (sum, item) => sum + (total === 0 ? 0 : (item.amount / total) * circumference),
        0
      );
    return { slice, length, dashOffset: -offset };
  });

  return (
    <StatCard>
      <p className="text-[12px] font-medium text-muted">분류별 지출</p>
      {slices.length ? (
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          <div className="w-36 shrink-0">
            <svg
              viewBox="0 0 200 200"
              className="w-full"
              role="img"
              aria-label="분류별 지출 비중"
            >
              <title>분류별 지출 비중</title>
              <circle
                cx={100}
                cy={100}
                r={radius}
                fill="none"
                stroke="var(--color-canvas-soft)"
                strokeWidth={22}
              />
              {arcs.map(({ slice, length, dashOffset }) => (
                <circle
                  key={slice.key}
                  cx={100}
                  cy={100}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={22}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 100 100)"
                >
                  <title>
                    {slice.name} {formatWon(slice.amount)} ({slice.pct}%)
                  </title>
                </circle>
              ))}
              <text
                x={100}
                y={95}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                총 지출
              </text>
              <text
                x={100}
                y={114}
                textAnchor="middle"
                fontSize={15}
                fontWeight={600}
                fill="var(--color-ink)"
              >
                {formatWon(total)}
              </text>
            </svg>
          </div>

          <ul className="min-w-0 flex-1 space-y-2">
            {slices.map((slice) => (
              <li key={slice.key}>
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink">
                    <span aria-hidden>{slice.emoji}</span>
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-body tabular-nums">
                    {formatWon(slice.amount)}{" "}
                    <span className="text-muted">{slice.pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas-soft">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(slice.pct, 100))}%`,
                      backgroundColor: slice.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted">기간 내 지출이 없어요</p>
      )}
    </StatCard>
  );
};

const MonthlyCard = ({ monthly }: { monthly: LedgerStats["monthly"] }) => {
  const width = 360;
  const height = 180;
  const left = 36;
  const right = 6;
  const top = 12;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max =
    Math.max(1, ...monthly.flatMap((month) => [month.income, month.expense])) * 1.1;
  const groupWidth = monthly.length ? plotWidth / monthly.length : plotWidth;
  const barWidth = Math.min(16, Math.max(4, groupWidth * 0.26));

  return (
    <StatCard>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">월별 입출금</p>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[color:var(--color-success)]" />
            수입
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-primary" />
            지출
          </span>
        </div>
      </div>

      {monthly.length ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-3 w-full"
          role="img"
          aria-label="월별 입출금"
        >
          <title>월별 입출금</title>
          {[0, 1, 2].map((index) => {
            const y = top + (index / 2) * plotHeight;
            const value = max - (index / 2) * max;
            return (
              <g key={index}>
                <line
                  x1={left}
                  x2={left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--color-hairline-soft)"
                  strokeWidth={1}
                />
                <text
                  x={left - 5}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill="var(--color-muted-soft)"
                >
                  {compactWon(value)}
                </text>
              </g>
            );
          })}

          {monthly.map((month, index) => {
            const center = left + groupWidth * (index + 0.5);
            const incomeHeight = (month.income / max) * plotHeight;
            const expenseHeight = (month.expense / max) * plotHeight;
            return (
              <g key={month.month}>
                <rect
                  x={center - barWidth - 1}
                  y={top + plotHeight - incomeHeight}
                  width={barWidth}
                  height={incomeHeight}
                  rx={2}
                  fill="var(--color-success)"
                >
                  <title>
                    {month.month} 수입 {formatWon(month.income)}
                  </title>
                </rect>
                <rect
                  x={center + 1}
                  y={top + plotHeight - expenseHeight}
                  width={barWidth}
                  height={expenseHeight}
                  rx={2}
                  fill="var(--color-primary)"
                >
                  <title>
                    {month.month} 지출 {formatWon(month.expense)}
                  </title>
                </rect>
                <text
                  x={center}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-muted-soft)"
                >
                  {Number(month.month.slice(5))}월
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p className="mt-2 text-[12px] text-muted">기간 내 기록이 없어요</p>
      )}
    </StatCard>
  );
};

const TopMerchantsCard = ({ merchants }: { merchants: LedgerStats["topMerchants"] }) => {
  const max = Math.max(1, ...merchants.map((merchant) => merchant.amount));

  return (
    <StatCard>
      <p className="text-[12px] font-medium text-muted">지출 TOP 8</p>
      {merchants.length ? (
        <ul className="mt-2 space-y-2.5">
          {merchants.map((merchant) => (
            <li key={merchant.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-body">{merchant.name}</span>
                <span className="shrink-0 text-[12px] font-medium text-ink tabular-nums">
                  {formatWon(merchant.amount)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-soft">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(merchant.amount / max) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[10px] text-muted-soft tabular-nums">
                  {merchant.count}건
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-muted">기간 내 지출이 없어요</p>
      )}
    </StatCard>
  );
};

const AssetsCard = ({ assets }: { assets: LedgerStats["byAsset"] }) => (
  <StatCard>
    <p className="text-[12px] font-medium text-muted">결제수단별 지출</p>
    {assets.length ? (
      <ul className="mt-2 divide-y divide-hairline-soft">
        {assets.map((asset) => (
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
      <p className="mt-2 text-[12px] text-muted">기간 내 지출이 없어요</p>
    )}
  </StatCard>
);

export const StatsView = ({ ledger, onOpenSettings }: Props) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeId>("all");
  const [note, setNote] = useState(ledger.budget.note);

  const selectedRange = RANGES.find((option) => option.id === range) ?? RANGES[0];
  const today = todayKst();
  const from = selectedRange.days
    ? kst(today)
        .subtract(selectedRange.days - 1, "day")
        .format("YYYY-MM-DD")
    : undefined;
  const to = selectedRange.days ? today : undefined;

  const statsQuery = useQuery({
    queryKey: ["ledger-stats", from ?? "all", to ?? "today"],
    queryFn: () => fetchStats(token, from, to),
    enabled: Boolean(token),
  });
  const stats = statsQuery.data;

  const { totalBudget, byCategory: categoryBudgets } = ledger.budget;
  const { income, expense, budgetRemaining, budgetUsedPct } = ledger.summary;

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

  const hasActivity = stats
    ? stats.summary.income !== 0 || stats.summary.expense !== 0
    : false;
  const rangeLabel = stats
    ? `${stats.from.replaceAll("-", ".")} ~ ${stats.to.replaceAll("-", ".")} · ${
        stats.days
      }일`
    : "기간 확인 중…";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between md:col-span-2">
        <p className="text-[12px] font-medium text-muted">기간별 리포트</p>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div className="flex rounded-full bg-canvas-soft p-1">
            {RANGES.map((option) => {
              const active = option.id === range;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRange(option.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-soft tabular-nums">{rangeLabel}</p>
        </div>
      </div>

      {statsQuery.isPending ? (
        <StatCard className="md:col-span-2">
          <p className="py-8 text-center text-[12px] text-muted">불러오는 중…</p>
        </StatCard>
      ) : statsQuery.isError ? (
        <StatCard className="md:col-span-2">
          <div className="flex flex-col items-center gap-2 py-8">
            <p className="text-[12px] text-muted">
              {statsQuery.error instanceof Error
                ? statsQuery.error.message
                : "통계를 불러오지 못했어요."}
            </p>
            <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()}>
              다시 불러오기
            </Button>
          </div>
        </StatCard>
      ) : stats ? (
        <>
          {hasActivity ? (
            <>
              <KpiCards stats={stats} />
              <BalanceCard daily={stats.daily} />
              <DepositsCard stats={stats} />
              <TogetherCard ledger={ledger} />
              <CategoryCard stats={stats} />
              <MonthlyCard monthly={stats.monthly} />
              <TopMerchantsCard merchants={stats.topMerchants} />
              <AssetsCard assets={stats.byAsset} />
            </>
          ) : (
            <StatCard className="md:col-span-2">
              <div className="flex flex-col items-center py-10">
                <div className="grid size-12 place-items-center rounded-full bg-canvas-soft text-primary">
                  <Wallet className="size-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-ink">
                  이 기간에는 기록이 없어요
                </p>
              </div>
            </StatCard>
          )}

          <StatCard className="md:col-span-2">
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
                <p className="text-[13px] text-muted">
                  예산을 정하면 진행률을 보여줄게요
                </p>
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
                      {budgetRemaining != null && budgetRemaining >= 0
                        ? "남은 돈"
                        : "초과"}
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
          </StatCard>

          <StatCard className="md:col-span-2">
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
          </StatCard>
        </>
      ) : null}
    </div>
  );
};
