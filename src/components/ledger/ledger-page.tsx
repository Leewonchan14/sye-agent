"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Plus,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { CalendarView } from "@/components/ledger/calendar-view";
import {
  ExpenseCategoryChips,
  type CategoryFilter,
} from "@/components/ledger/category-chips";
import { CategoryIcon } from "@/components/ledger/category-icon";
import { EntryDialog } from "@/components/ledger/entry-dialog";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import { PasteDialog } from "@/components/ledger/paste-dialog";
import { RecurringTab } from "@/components/ledger/recurring-tab";
import {
  SettingsDialog,
  TripsTab,
  type LedgerSettingsTab,
} from "@/components/ledger/settings-dialog";
import { CategoryCard, StatsView } from "@/components/ledger/stats-view";
import { groupTopExpenses, TopExpensesList } from "@/components/ledger/top-expenses";
import { WeeklyRecapCard } from "@/components/ledger/weekly-recap-card";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerMonthPayload } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { LEDGER_LIVE_QUERY, ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import {
  currentMonthKst,
  formatCompactWon,
  formatDayKo,
  formatMonthKo,
  formatWon,
  shiftMonth,
  todayKst,
} from "@/lib/ledger/format";
import { getBudgetPace, type LedgerBudgetPace } from "@/lib/ledger/pace";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "list", label: "내역" },
  { id: "calendar", label: "달력" },
  { id: "stats", label: "통계" },
  { id: "recurring", label: "반복" },
  { id: "trips", label: "여행" },
] as const;

type LedgerTab = (typeof TABS)[number]["id"];

interface DayGroup {
  date: string;
  entries: LedgerEntryView[];
  expense: number;
  income: number;
}

interface SearchResult {
  entries: LedgerEntryView[];
  income: number;
  expense: number;
  count: number;
}

const SummaryCard = ({
  label,
  value,
  hint,
  note,
  tone,
  bar,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  note?: string;
  tone?: "success" | "primary" | "error";
  bar?: { pct: number; marker?: number };
  onClick?: () => void;
}) => {
  const body = (
    <Card className="h-full rounded-2xl border border-hairline bg-surface py-4 ring-0">
      <CardContent className="px-4">
        <p className="text-[11px] font-medium tracking-wide text-muted">{label}</p>
        <p
          className={cn(
            "mt-1 text-lg font-semibold tabular-nums md:text-xl",
            !tone && "text-ink",
            tone === "success" && "text-[color:var(--color-success)]",
            tone === "primary" && "text-[color:var(--color-primary)]",
            tone === "error" && "text-[color:var(--color-error)]"
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-soft">{hint}</p>
        {bar && (
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-canvas-soft">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(bar.pct, 100))}%` }}
            />
            {bar.marker != null && (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-ink/50"
                style={{ left: `${bar.marker}%` }}
              />
            )}
          </div>
        )}
        {note && <p className="mt-1.5 text-[11px] text-body">{note}</p>}
      </CardContent>
    </Card>
  );

  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </button>
  );
};

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
        className={cn(
          "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
          tab === option.id && "bg-surface text-ink ring-1 ring-hairline",
          tab !== option.id && "text-muted hover:text-body"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const paceNote = (pace: LedgerBudgetPace | null): string | undefined => {
  if (pace?.state !== "current") return undefined;
  if (pace.status === "over") return "이번 달 예산을 넘었어요";
  const daily = `하루 약 ${formatCompactWon(pace.dailyAllowance)}원까지`;
  return pace.status === "risk"
    ? `${daily} · 이 속도면 ${formatCompactWon(pace.projectedOver)}원 초과`
    : `${daily} · 지금 속도면 예산 안이에요`;
};

const CategoryBudgetCard = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const spentById = new Map(ledger.byCategory.map((row) => [row.categoryId, row.amount]));
  const rows = ledger.budget.byCategory
    .map((row) => {
      const category = ledger.categories.find((c) => c.id === row.categoryId);
      return category ? { ...row, category } : null;
    })
    .filter((row) => row !== null);

  if (!rows.length) return null;

  return (
    <section
      aria-label="분류별 예산"
      className="mt-3 rounded-2xl border border-hairline bg-surface p-4"
    >
      <p className="text-[12px] font-medium text-muted">분류별 예산</p>
      <ul className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(({ category, amount }) => {
          const spent = spentById.get(category.id) ?? 0;
          const remaining = amount - spent;
          return (
            <li key={category.id}>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="flex min-w-0 items-center gap-1.5 text-ink">
                  <CategoryIcon icon={category.icon} color={category.color} size={18} />
                  <span className="truncate">{category.name}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] tabular-nums",
                    remaining >= 0 && "text-muted",
                    remaining < 0 && "text-[color:var(--color-error)]"
                  )}
                >
                  {remaining >= 0
                    ? `${formatWon(remaining)} 남음`
                    : `${formatWon(-remaining)} 초과`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className={cn(
                    "h-full rounded-full",
                    remaining >= 0 && "bg-primary",
                    remaining < 0 && "bg-[var(--color-error)]"
                  )}
                  style={{ width: `${Math.min((spent / amount) * 100, 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** 이 분류를 골랐을 때 합계를 함께 보여 줄 분류. 내역 목록에는 섞지 않는다. */
const COMPANION_CATEGORY: Record<string, string> = { 식비: "카페" };

const CategoryTotalLine = ({
  monthLabel,
  name,
  entries,
}: {
  monthLabel: string;
  name: string;
  entries: LedgerEntryView[];
}) => (
  <p className="px-1 text-[12px] text-muted tabular-nums">
    {monthLabel} {name} {entries.length}건 · 지출{" "}
    <span className="font-medium text-ink">
      {formatWon(entries.reduce((sum, entry) => sum + entry.amount, 0))}
    </span>
  </p>
);

const SearchResults = ({
  query,
  onEdit,
}: {
  query: string;
  onEdit: (entry: LedgerEntryView) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const { data, isPending, isError } = useQuery({
    queryKey: ledgerKeys.search(query),
    queryFn: async () => {
      const { result } = await ledgerRequest<{ result: SearchResult }>(
        token,
        `/api/ledger/search?q=${encodeURIComponent(query)}`
      );
      return result;
    },
    enabled: Boolean(token),
  });

  return (
    <section className="rounded-2xl border border-hairline bg-surface p-2 md:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pt-1 pb-1.5">
        <h3 className="text-[13px] font-medium text-ink">전체 기간 검색 결과</h3>
        {data && (
          <span className="text-[11px] text-muted tabular-nums">
            {data.count}건 · 지출 {formatWon(data.expense)} · 입금{" "}
            {formatWon(data.income)}
          </span>
        )}
      </div>
      {isPending ? (
        <p className="px-2 py-6 text-center text-[12px] text-muted">찾는 중…</p>
      ) : isError ? (
        <p className="px-2 py-6 text-center text-[12px] text-muted">검색하지 못했어요</p>
      ) : (
        <div className="divide-y divide-hairline-soft">
          {data.entries.length ? (
            data.entries.map((entry) => (
              <div key={entry.id}>
                <p className="px-2 pt-1.5 text-[10px] text-muted-soft tabular-nums">
                  {entry.entryDate.replaceAll("-", ".")}
                </p>
                <LedgerEntryList entries={[entry]} onEdit={onEdit} />
              </div>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-[12px] text-muted">
              일치하는 내역이 없어요
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export const LedgerPage = () => {
  const token = useAuthStore((s) => s.token);
  const [month, setMonth] = useState<string>(() => currentMonthKst());
  const [tab, setTab] = useState<LedgerTab>("list");
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<LedgerSettingsTab>("budget");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const {
    data: ledger,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ledgerKeys.month(month),
    queryFn: async () => {
      const data = await ledgerRequest<{ ledger: LedgerMonthPayload }>(
        token,
        `/api/ledger?month=${month}`
      );
      return data.ledger;
    },
    enabled: Boolean(token),
    ...LEDGER_LIVE_QUERY,
  });

  // 고른 분류가 삭제됐으면 빈 목록 대신 전체를 보여 준다.
  const filterCategory =
    ledger?.categories.find(
      (category) => category.kind === "expense" && category.id === categoryFilter
    ) ?? null;
  const filterCategoryId = filterCategory?.id ?? null;

  const listEntries = useMemo(() => {
    const entries = ledger?.entries ?? [];
    return filterCategoryId == null
      ? entries
      : entries.filter((entry) => entry.categoryId === filterCategoryId);
  }, [ledger?.entries, filterCategoryId]);

  const companionName = filterCategory && COMPANION_CATEGORY[filterCategory.name];
  const companionCategory =
    ledger?.categories.find(
      (category) => category.kind === "expense" && category.name === companionName
    ) ?? null;
  const companionEntries = companionCategory
    ? (ledger?.entries ?? []).filter((entry) => entry.categoryId === companionCategory.id)
    : [];

  const topExpenses = useMemo(
    () => groupTopExpenses(ledger?.entries ?? [], filterCategoryId ?? "all"),
    [ledger?.entries, filterCategoryId]
  );

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const entry of listEntries) {
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
  }, [listEntries]);

  const openAdd = () => {
    setEditingEntry(null);
    setEntryOpen(true);
  };

  const openEdit = (entry: LedgerEntryView) => {
    setEditingEntry(entry);
    setEntryOpen(true);
  };

  const openSettings = (next: LedgerSettingsTab = "budget") => {
    setSettingsTab(next);
    setSettingsOpen(true);
  };

  const thisMonth = currentMonthKst();
  const today = todayKst();
  const fallbackDay = month === thisMonth ? today : `${month}-01`;
  const activeDay = selectedDay?.startsWith(`${month}-`) ? selectedDay : fallbackDay;
  const defaultEntryDate = tab === "calendar" ? activeDay : fallbackDay;
  // 통계·반복·여행 탭은 월과 상관없는 화면이라 월 이동과 요약을 숨긴다.
  const hidesMonthSummary = tab === "stats" || tab === "recurring" || tab === "trips";
  const monthLabel = formatMonthKo(month);

  const totalBudget = ledger?.budget.totalBudget ?? null;
  const pace = ledger
    ? getBudgetPace({
        month,
        today,
        budget: totalBudget,
        spent: ledger.summary.expense,
      })
    : null;
  const isOverBudget = (ledger?.summary.budgetRemaining ?? 0) < 0;

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
              원찬이와 예은이의 모임통장 가계부
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => openSettings()} disabled={!ledger}>
              <Settings2 /> 예산·설정
            </Button>
            <Button
              variant="outline"
              onClick={() => setPasteOpen(true)}
              disabled={!ledger}
            >
              <ClipboardPaste /> 알림 붙여넣기
            </Button>
            <Button onClick={openAdd} disabled={!ledger}>
              <Plus /> 내역 추가
            </Button>
          </div>
        </header>

        {/* 탭은 항상 같은 자리에 두고, 월 이동은 그 아래 왼쪽에 둔다. */}
        <div className="mt-5 flex flex-col items-start gap-2">
          <LedgerTabs tab={tab} onChange={setTab} />

          {!hidesMonthSummary && (
            <div className="-ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="이전 달"
                onClick={() => setMonth((current) => shiftMonth(current, -1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-24 text-center text-sm font-medium text-ink tabular-nums">
                {monthLabel}
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
          )}
        </div>

        <div className={cn("mt-4", hidesMonthSummary && "hidden")}>
          <WeeklyRecapCard />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {!ledger ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-[104px] animate-pulse rounded-2xl border border-hairline bg-canvas-soft"
                />
              ))
            ) : (
              <>
                <SummaryCard
                  label="모임통장 잔액"
                  value={formatWon(ledger.account.currentBalance)}
                  hint={
                    ledger.account.checkedAt
                      ? `${kst(ledger.account.checkedAt).format("M월 D일")} 통장과 맞춤`
                      : "눌러서 실제 잔액과 맞추기"
                  }
                  tone={ledger.account.currentBalance < 0 ? "error" : undefined}
                  onClick={() => openSettings("account")}
                />
                <SummaryCard
                  label="입금"
                  value={formatWon(ledger.summary.income)}
                  hint={`${monthLabel} 입금`}
                  tone="success"
                />
                <SummaryCard
                  label="지출"
                  value={formatWon(ledger.summary.expense)}
                  hint={`${monthLabel} 지출`}
                  tone="primary"
                />
                {totalBudget == null ? (
                  <Card className="rounded-2xl border border-hairline bg-surface py-4 ring-0">
                    <CardContent className="flex h-full flex-col justify-between px-4">
                      <div>
                        <p className="text-[11px] font-medium tracking-wide text-muted">
                          예산
                        </p>
                        <p className="mt-1 text-lg font-semibold text-muted-soft md:text-xl">
                          아직 없음
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 self-start"
                        onClick={() => openSettings()}
                      >
                        예산 정하기
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <SummaryCard
                    label="예산"
                    value={
                      isOverBudget
                        ? `${formatWon(-(ledger.summary.budgetRemaining ?? 0))} 초과`
                        : `${formatWon(ledger.summary.budgetRemaining ?? 0)} 남음`
                    }
                    hint={`${formatWon(totalBudget)} 중 ${ledger.summary.budgetUsedPct ?? 0}%`}
                    note={paceNote(pace)}
                    tone={isOverBudget ? "error" : undefined}
                    bar={{
                      pct: ledger.summary.budgetUsedPct ?? 0,
                      marker: pace?.state === "current" ? pace.elapsedPct : undefined,
                    }}
                  />
                )}
              </>
            )}
          </div>
          {ledger && <CategoryBudgetCard ledger={ledger} />}
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
          ) : isError && !ledger ? (
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
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                    <Input
                      type="search"
                      aria-label="내역 검색"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="내용, 태그, 분류로 전체 기간 검색"
                      className="pl-9"
                    />
                  </div>

                  {!deferredSearch && (
                    <ExpenseCategoryChips
                      label="내역 분류"
                      categories={ledger.categories}
                      selected={filterCategory?.id ?? "all"}
                      onSelect={setCategoryFilter}
                    />
                  )}

                  {!deferredSearch &&
                    filterCategory &&
                    (dayGroups.length > 0 || companionCategory) && (
                      <div className="space-y-0.5">
                        {dayGroups.length > 0 && (
                          <CategoryTotalLine
                            monthLabel={monthLabel}
                            name={filterCategory.name}
                            entries={listEntries}
                          />
                        )}
                        {companionCategory && (
                          <CategoryTotalLine
                            monthLabel={monthLabel}
                            name={companionCategory.name}
                            entries={companionEntries}
                          />
                        )}
                      </div>
                    )}

                  {!deferredSearch && topExpenses.length > 0 && (
                    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
                      {/* 내역 필터를 따른다: 분류를 고르면 그 분류의 사용처별 지출. */}
                      {filterCategory ? (
                        <CategoryCard
                          key={filterCategory.id}
                          entries={listEntries}
                          groupBy="place"
                          title={`${filterCategory.name} 사용처별 지출`}
                        />
                      ) : (
                        <CategoryCard
                          total={ledger.summary.expense}
                          byCategory={ledger.byCategory}
                          entries={ledger.entries}
                        />
                      )}
                      {topExpenses.length > 0 && (
                        <section
                          aria-label="큰 지출"
                          className="rounded-2xl border border-hairline bg-surface p-4"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-[12px] font-medium text-muted">
                              큰 지출 TOP 8
                            </h3>
                            <span className="text-[11px] text-muted">
                              {monthLabel}
                              {filterCategory && ` · ${filterCategory.name}`}
                            </span>
                          </div>
                          <TopExpensesList items={topExpenses} className="mt-2" />
                        </section>
                      )}
                    </div>
                  )}

                  {deferredSearch ? (
                    <SearchResults query={deferredSearch} onEdit={openEdit} />
                  ) : filterCategory && !dayGroups.length ? (
                    <div className="rounded-2xl border border-hairline bg-surface px-6 py-10 text-center">
                      <p className="text-[13px] text-muted">
                        {monthLabel}에는 {filterCategory.name} 내역이 없어요
                      </p>
                    </div>
                  ) : dayGroups.length ? (
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
                            {group.income > 0 && ` · 입금 ${formatWon(group.income)}`}
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

              {tab === "calendar" && (
                <CalendarView
                  ledger={ledger}
                  activeDay={activeDay}
                  onSelectDay={setSelectedDay}
                  onEdit={openEdit}
                />
              )}

              {tab === "recurring" && <RecurringTab ledger={ledger} />}

              {tab === "trips" && <TripsTab ledger={ledger} />}

              {tab === "stats" && (
                <StatsView
                  categories={ledger.categories}
                  month={month}
                  onMonthChange={setMonth}
                  trips={ledger.trips}
                  expenseReference={ledger.expenseReference}
                  totalBudget={ledger.budget.totalBudget}
                  onEdit={openEdit}
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
            defaultDate={defaultEntryDate}
            entry={editingEntry}
          />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            ledger={ledger}
            initialTab={settingsTab}
          />
          <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />
        </>
      )}
    </SidebarLayout>
  );
};
