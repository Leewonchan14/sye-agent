"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Settings2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import useLocalStorageState from "use-local-storage-state";

import { CalendarView } from "@/components/ledger/calendar-view";
import { EntryDialog } from "@/components/ledger/entry-dialog";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import { SettingsDialog } from "@/components/ledger/settings-dialog";
import { StatsView } from "@/components/ledger/stats-view";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import {
  currentMonthKst,
  formatDayKo,
  formatMonthKo,
  formatWon,
  LEDGER_MEMBERS,
  memberTone,
  shiftMonth,
  type LedgerMember,
} from "@/lib/ledger/members";

const TABS = [
  { id: "list", label: "내역" },
  { id: "calendar", label: "달력" },
  { id: "stats", label: "통계" },
] as const;

type LedgerTab = (typeof TABS)[number]["id"];

interface DayGroup {
  date: string;
  entries: LedgerEntryView[];
  expense: number;
  income: number;
}

const fetchLedger = async (token: string, month: string): Promise<LedgerMonthPayload> => {
  const res = await fetch(`/api/ledger?month=${month}`, {
    headers: { "x-auth-token": token },
  });
  const data = (await res.json().catch(() => null)) as {
    ledger?: LedgerMonthPayload;
    error?: string;
  } | null;
  if (!res.ok || !data?.ledger) {
    throw new Error(data?.error ?? "가계부를 불러오지 못했어요.");
  }
  return data.ledger;
};

const SummaryCard = ({
  label,
  value,
  hint,
  tone,
  bar,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "primary";
  bar?: { pct: number };
}) => (
  <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
    <CardContent className="px-4">
      <p className="text-[11px] font-medium tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "success"
            ? "text-[color:var(--color-success)]"
            : tone === "primary"
              ? "text-[color:var(--color-primary)]"
              : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-soft">{hint}</p>
      {bar && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas-soft">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(bar.pct, 100))}%` }}
          />
        </div>
      )}
    </CardContent>
  </Card>
);

const LedgerTabs = ({
  tab,
  onChange,
}: {
  tab: LedgerTab;
  onChange: (tab: LedgerTab) => void;
}) => (
  <div
    className="inline-flex rounded-full bg-canvas-soft p-1"
    role="tablist"
    aria-label="가계부 보기"
  >
    {TABS.map((option) => (
      <button
        key={option.id}
        type="button"
        role="tab"
        aria-selected={tab === option.id}
        onClick={() => onChange(option.id)}
        className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
          tab === option.id
            ? "bg-surface text-ink ring-1 ring-hairline"
            : "text-muted hover:text-body"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const LedgerPage = () => {
  const token = useAuthStore((s) => s.token);
  const [month, setMonth] = useState<string>(() => currentMonthKst());
  const [storedMember, setStoredMember] = useLocalStorageState<LedgerMember>(
    "ledger.member",
    { defaultValue: "wonchan" }
  );
  const [tab, setTab] = useState<LedgerTab>("list");
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const member: LedgerMember = storedMember === "yeeun" ? "yeeun" : "wonchan";

  const {
    data: ledger,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["ledger", month],
    queryFn: () => fetchLedger(token, month),
    enabled: Boolean(token),
    staleTime: 15_000,
  });

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const entry of ledger?.entries ?? []) {
      const group = groups.get(entry.entryDate) ?? {
        date: entry.entryDate,
        entries: [],
        expense: 0,
        income: 0,
      };
      group.entries.push(entry);
      if (entry.kind === "income") group.income += entry.amount;
      else group.expense += entry.amount;
      groups.set(entry.entryDate, group);
    }

    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger?.entries]);

  const openAdd = () => {
    setEditingEntry(null);
    setEntryOpen(true);
  };

  const openEdit = (entry: LedgerEntryView) => {
    setEditingEntry(entry);
    setEntryOpen(true);
  };

  const thisMonth = currentMonthKst();
  const totalBudget = ledger?.budget.totalBudget ?? null;

  return (
    <SidebarLayout activeNav="ledger">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 md:px-8 md:py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-canvas-card text-primary">
                <Wallet className="size-4" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">가계부</h1>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              원찬이와 예은이가 함께 쓰는 가계부
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-hairline bg-surface p-1 pl-2.5">
              <span className="text-[11px] text-muted">기록자</span>
              {LEDGER_MEMBERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={member === option.id}
                  onClick={() => setStoredMember(option.id)}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors ${
                    member === option.id
                      ? memberTone(option.id)
                      : "text-muted ring-transparent hover:bg-canvas-soft"
                  }`}
                >
                  {option.name}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              disabled={!ledger}
            >
              <Settings2 /> 예산·설정
            </Button>
            <Button onClick={openAdd} disabled={!ledger}>
              <Plus /> 내역 추가
            </Button>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="이전 달"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center text-sm font-medium text-ink tabular-nums">
              {formatMonthKo(month)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="다음 달"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
            >
              <ChevronRight />
            </Button>
            {month !== thisMonth && (
              <Button variant="ghost" size="sm" onClick={() => setMonth(thisMonth)}>
                이번 달
              </Button>
            )}
          </div>

          <LedgerTabs tab={tab} onChange={setTab} />
        </div>

        <div
          className={`mt-4 grid gap-3 sm:grid-cols-3 ${tab === "stats" ? "hidden" : ""}`}
        >
          {!ledger ? (
            Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-[104px] animate-pulse rounded-2xl border border-hairline bg-canvas-soft"
              />
            ))
          ) : (
            <>
              <SummaryCard
                label="수입"
                value={formatWon(ledger.summary.income)}
                hint="이번 달 수입"
                tone="success"
              />
              <SummaryCard
                label="지출"
                value={formatWon(ledger.summary.expense)}
                hint="이번 달 지출"
                tone="primary"
              />
              {totalBudget == null ? (
                <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
                  <CardContent className="flex h-full flex-col justify-between px-4">
                    <div>
                      <p className="text-[11px] font-medium tracking-wide text-muted">
                        예산
                      </p>
                      <p className="mt-1 text-xl font-semibold text-muted-soft">
                        아직 없음
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 self-start"
                      onClick={() => setSettingsOpen(true)}
                    >
                      예산 정하기
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <SummaryCard
                  label="예산"
                  value={
                    ledger.summary.budgetRemaining != null &&
                    ledger.summary.budgetRemaining >= 0
                      ? `${formatWon(ledger.summary.budgetRemaining)} 남음`
                      : `${formatWon(-(ledger.summary.budgetRemaining ?? 0))} 초과`
                  }
                  hint={`${formatWon(totalBudget)} 중 ${ledger.summary.budgetUsedPct ?? 0}%`}
                  bar={{ pct: ledger.summary.budgetUsedPct ?? 0 }}
                />
              )}
            </>
          )}
        </div>

        <div className="mt-6">
          {isLoading && !ledger ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl border border-hairline bg-canvas-soft"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-hairline bg-surface px-6 py-10 text-center">
              <p className="text-sm font-medium text-ink">가계부를 불러오지 못했어요</p>
              <p className="mt-1 text-[12px] text-muted">
                {error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetch()}
              >
                다시 시도
              </Button>
            </div>
          ) : ledger ? (
            <>
              {tab === "list" && (
                <div className="space-y-3">
                  {dayGroups.length ? (
                    dayGroups.map((group) => (
                      <section
                        key={group.date}
                        className="rounded-2xl border border-hairline bg-surface p-2 md:p-3"
                      >
                        <div className="flex items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">
                          <h3 className="text-[13px] font-medium text-ink">
                            {formatDayKo(group.date)}
                          </h3>
                          <span className="text-[11px] text-muted tabular-nums">
                            지출 {formatWon(group.expense)}
                            {group.income > 0 && ` · 수입 ${formatWon(group.income)}`}
                          </span>
                        </div>
                        <LedgerEntryList entries={group.entries} onEdit={openEdit} />
                      </section>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-hairline bg-surface px-6 py-12 text-center">
                      <div className="mx-auto grid size-12 place-items-center rounded-full bg-canvas-soft text-primary">
                        <Wallet className="size-5" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-ink">
                        아직 기록이 없어요
                      </p>
                      <p className="mt-1 text-[13px] text-muted">첫 지출을 남겨보세요</p>
                      <Button className="mt-4" size="sm" onClick={openAdd}>
                        <Plus /> 내역 추가
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {tab === "calendar" && <CalendarView ledger={ledger} onEdit={openEdit} />}

              {tab === "stats" && (
                <StatsView
                  key={`${ledger.month}:${ledger.budget.note}`}
                  ledger={ledger}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )}
            </>
          ) : null}
        </div>
      </main>

      {ledger && (
        <>
          <EntryDialog
            open={entryOpen}
            onOpenChange={setEntryOpen}
            ledger={ledger}
            defaultMember={member}
            entry={editingEntry}
          />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            ledger={ledger}
          />
        </>
      )}
    </SidebarLayout>
  );
};
