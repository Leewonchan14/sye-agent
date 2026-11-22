"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Plane,
  Plus,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { createParser, parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import useLocalStorageState from "use-local-storage-state";

import { CalendarView } from "@/components/ledger/calendar-view";
import {
  ExpenseCategoryChips,
  TripScopePicker,
  type CategoryFilter,
} from "@/components/ledger/category-chips";
import { CategoryIcon } from "@/components/ledger/category-icon";
import { EntryDialog } from "@/components/ledger/entry-dialog";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { LedgerEntryList } from "@/components/ledger/entry-list";
import { PasteDialog } from "@/components/ledger/paste-dialog";
import { MonthPicker, WeekPicker } from "@/components/ledger/period-picker";
import { RecapCard, type RecapCategory } from "@/components/ledger/recap-card";
import { RecurringTab } from "@/components/ledger/recurring-tab";
import { reportQueryParsers } from "@/components/ledger/report-query";
import {
  SettingsDialog,
  TripsTab,
  type LedgerSettingsTab,
} from "@/components/ledger/settings-dialog";
import { CategoryCard, StatsView } from "@/components/ledger/stats-view";
import { groupTopExpenses, TopExpensesList } from "@/components/ledger/top-expenses";
import { ViewToggle } from "@/components/ledger/view-toggle";
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
import {
  calendarOf,
  scopeLedgerToCategory,
  scopeLedgerToTrips,
  type TripScope,
} from "@/lib/ledger/trip-scope";
import { useLedgerViewStore } from "@/lib/ledger/view-store";
import {
  formatWeekKo,
  isInWeek,
  shiftWeek,
  weekMonth,
  weekMonths,
  weekStartOf,
} from "@/lib/ledger/week";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "list", label: "내역" },
  { id: "calendar", label: "달력" },
  { id: "stats", label: "통계" },
  { id: "recurring", label: "반복" },
  { id: "trips", label: "여행" },
] as const;

type LedgerTab = (typeof TABS)[number]["id"];

// 탭과 고른 여행은 주소(?tab=, ?trip=)에 둔다. 새로고침·뒤로 가기·공유한 주소에서도 같은 화면이 열린다.
const parseAsLedgerTab = parseAsStringLiteral(TABS.map((option) => option.id))
  .withDefault("list")
  .withOptions({ history: "push" });

const PERIODS = [
  { id: "month", label: "월" },
  { id: "week", label: "주" },
] as const;

const PLACE_PHOTO_SIZES = [
  { id: "small", label: "사진 작게" },
  { id: "large", label: "사진 크게" },
] as const;

export type LedgerPeriod = (typeof PERIODS)[number]["id"];

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
  testId,
}: {
  testId?: string;
  label: string;
  value: string;
  hint: string;
  note?: string;
  tone?: "success" | "primary" | "error";
  bar?: { pct: number; marker?: number };
  onClick?: () => void;
}) => {
  const body = (
    <Card
      data-testid={testId}
      className="h-full rounded-2xl border border-hairline bg-surface py-4 ring-0"
    >
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

/** 여행 하나를 골라 볼 때 리캡 자리에 두는 여행 요약. 금액은 기간과 상관없는 여행 전체 합계다. */
const TripFocusCard = ({
  trip,
  onClose,
}: {
  trip: LedgerMonthPayload["trips"][number];
  onClose: () => void;
}) => (
  <Card className="mb-3 rounded-2xl border border-hairline bg-surface py-4 ring-0">
    <CardContent className="flex items-start justify-between gap-3 px-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <Plane className="size-3.5" /> 여행만 보는 중
        </p>
        <p className="mt-1 truncate text-lg font-semibold text-ink">{trip.name}</p>
        <p className="mt-0.5 text-[12px] text-muted tabular-nums">
          {kst(trip.startDate).format("M월 D일")} ~ {kst(trip.endDate).format("M월 D일")}
        </p>
        <p className="text-[12px] text-muted tabular-nums">
          여행 전체 지출 {formatWon(trip.expense)} · {trip.entryCount}건
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClose}>
        전체 보기
      </Button>
    </CardContent>
  </Card>
);

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
  periodLabel,
  name,
  entries,
}: {
  periodLabel: string;
  name: string;
  entries: LedgerEntryView[];
}) => (
  <p className="px-1 text-[12px] text-muted tabular-nums">
    {periodLabel} {name} {entries.length}건 · 지출{" "}
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

/**
 * 달력 탭에서 고른 날은 `?day=YYYY-MM-DD`로 주소에 남긴다(탭은 `?tab=calendar`). 새로 고치거나
 * 주소를 공유해도 그 날이 든 달의 달력에서 그 날을 고른 채로 열린다. 날짜를 누를 때마다
 * 히스토리를 쌓지 않도록 주소를 바꿔 끼운다. 형식이 맞지 않으면 없는 것으로 본다.
 */
const parseAsDayKey = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
}).withOptions({ history: "replace" });

export const LedgerPage = () => {
  const token = useAuthStore((s) => s.token);
  const [selectedDay, setSelectedDay] = useQueryState("day", parseAsDayKey);
  // 주소에 고른 날이 있으면 그 날이 든 달(주)로 연다.
  const [month, setMonth] = useState<string>(
    () => selectedDay?.slice(0, 7) ?? currentMonthKst()
  );
  // 주 단위로 볼 때 그 주의 월요일. 이때 month는 그 주가 속한 달을 따라간다.
  const [period, setPeriod] = useState<LedgerPeriod>("month");
  const [weekStart, setWeekStart] = useState<string>(() =>
    weekStartOf(selectedDay ?? todayKst())
  );
  const isWeek = period === "week";
  const [tab, setTab] = useQueryState("tab", parseAsLedgerTab);
  const [entryOpen, setEntryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntryView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<LedgerSettingsTab>("budget");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  // 여행 제외는 내역·달력·통계 탭이 함께 쓰고, 다음에 열어도 이어서 보이도록 기기에 저장한다.
  const [excludeTrips, setExcludeTrips] = useLocalStorageState("ledger.excludeTrips", {
    defaultValue: false,
  });
  // 여행 하나만 골라 보기. 여행 제외와 함께 켜지지 않는다.
  const [focusedTripId, setFocusedTripId] = useQueryState("trip", parseAsInteger);
  // 통계 탭 기간별 리포트의 기간 종류(?report=). 여행 바로가기와 여행 해제 때 함께 바꾼다.
  const [reportRange, setReportRange] = useQueryState(
    "report",
    reportQueryParsers.report
  );

  const {
    data: fullLedger,
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

  // 두 달에 걸친 주는 다른 달 내역도 읽어 합친다.
  const otherMonth = isWeek ? weekMonths(weekStart).find((m) => m !== month) : undefined;
  const otherQuery = useQuery({
    queryKey: ledgerKeys.month(otherMonth ?? ""),
    queryFn: async () => {
      const data = await ledgerRequest<{ ledger: LedgerMonthPayload }>(
        token,
        `/api/ledger?month=${otherMonth}`
      );
      return data.ledger;
    },
    enabled: Boolean(token && otherMonth),
    ...LEDGER_LIVE_QUERY,
  });
  const hasTrips = (fullLedger?.trips.length ?? 0) > 0;
  // 고른 여행이 지워졌으면 전체로 돌아간다.
  const focusedTrip =
    focusedTripId == null
      ? null
      : (fullLedger?.trips.find((trip) => trip.id === focusedTripId) ?? null);
  const tripScope: TripScope = !hasTrips
    ? "all"
    : focusedTrip
      ? focusedTrip.id
      : excludeTrips
        ? "exclude"
        : "all";
  const tripsExcluded = tripScope === "exclude";
  // 화면에 보여 줄 내역·합계. 여행 제외는 여행에 묶인 내역을 빼고, 여행을 고르면 그 여행 내역만 남긴다.
  // 입력·설정 창과 여행 탭은 늘 전체 데이터(fullLedger)를 쓴다.
  const ledger = useMemo(
    () => (fullLedger ? scopeLedgerToTrips(fullLedger, tripScope) : fullLedger),
    [fullLedger, tripScope]
  );
  const otherLedger = useMemo(() => {
    const data = otherMonth ? otherQuery.data : undefined;
    return data ? scopeLedgerToTrips(data, tripScope) : data;
  }, [otherMonth, otherQuery.data, tripScope]);
  const periodPending = Boolean(otherMonth) && !otherLedger;
  const loadError = isError ? error : otherQuery.error;

  // 지금 보는 기간(달 또는 주)의 내역과 날짜별 합계.
  const periodEntries = useMemo(() => {
    if (!ledger) return [];
    if (!isWeek) return ledger.entries;
    return [...ledger.entries, ...(otherLedger?.entries ?? [])].filter((entry) =>
      isInWeek(entry.entryDate, weekStart)
    );
  }, [ledger, otherLedger, isWeek, weekStart]);
  const periodCalendar = useMemo(() => {
    if (!ledger) return [];
    if (!isWeek) return ledger.calendar;
    return [...ledger.calendar, ...(otherLedger?.calendar ?? [])].filter((day) =>
      isInWeek(day.date, weekStart)
    );
  }, [ledger, otherLedger, isWeek, weekStart]);

  // 주 단위일 때 쓰는 합계와 분류별 지출. 달 단위는 서버가 계산한 값을 쓴다.
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    const totals = new Map<number | null, LedgerMonthPayload["byCategory"][number]>();
    for (const entry of periodEntries) {
      if (entry.kind === "income") {
        income += entry.amount;
        continue;
      }
      expense += entry.amount;
      const row = totals.get(entry.categoryId) ?? {
        categoryId: entry.categoryId,
        name: entry.categoryName ?? "분류 없음",
        emoji: entry.categoryEmoji ?? "🧾",
        icon: entry.categoryIcon ?? "tag",
        color: entry.categoryColor ?? "neutral",
        amount: 0,
        pct: 0,
      };
      row.amount += entry.amount;
      totals.set(entry.categoryId, row);
    }
    const byCategory = [...totals.values()]
      .map((row) => ({
        ...row,
        pct: expense === 0 ? 0 : Math.round((row.amount / expense) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
    return { income, expense, byCategory };
  }, [periodEntries]);

  // 고른 분류가 삭제됐으면 빈 목록 대신 전체를 보여 준다.
  const filterCategory =
    ledger?.categories.find(
      (category) => category.kind === "expense" && category.id === categoryFilter
    ) ?? null;
  const filterCategoryId = filterCategory?.id ?? null;

  const listEntries = useMemo(
    () =>
      filterCategoryId == null
        ? periodEntries
        : periodEntries.filter((entry) => entry.categoryId === filterCategoryId),
    [periodEntries, filterCategoryId]
  );

  // 달력은 고른 분류의 내역과 날짜별 합계만 보여 준다.
  const calendarLedger = useMemo(
    () => (ledger ? scopeLedgerToCategory(ledger, filterCategoryId) : ledger),
    [ledger, filterCategoryId]
  );
  const calendarDays = useMemo(
    () => (filterCategoryId == null ? periodCalendar : calendarOf(listEntries)),
    [filterCategoryId, periodCalendar, listEntries]
  );
  // 분류를 고르면 위쪽 지출 카드도 그 분류의 지출만 센다.
  const categoryTotals = useMemo(() => {
    let expense = 0;
    let count = 0;
    for (const entry of listEntries) {
      if (entry.kind !== "expense") continue;
      expense += entry.amount;
      count += 1;
    }
    return { expense, count };
  }, [listEntries]);
  const filterCategoryName = filterCategory?.name ?? null;
  const recapCategory = useMemo<RecapCategory | null>(
    () =>
      filterCategoryId != null && filterCategoryName
        ? { id: filterCategoryId, name: filterCategoryName }
        : null,
    [filterCategoryId, filterCategoryName]
  );

  const companionName = filterCategory && COMPANION_CATEGORY[filterCategory.name];
  const companionCategory =
    ledger?.categories.find(
      (category) => category.kind === "expense" && category.name === companionName
    ) ?? null;
  const companionEntries = companionCategory
    ? periodEntries.filter((entry) => entry.categoryId === companionCategory.id)
    : [];

  const topExpenses = useMemo(
    () => groupTopExpenses(periodEntries, filterCategoryId ?? "all"),
    [periodEntries, filterCategoryId]
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
  const thisWeek = weekStartOf(today);
  const inPeriod = (date: string) =>
    isWeek ? isInWeek(date, weekStart) : date.startsWith(`${month}-`);
  const fallbackDay = inPeriod(today) ? today : isWeek ? weekStart : `${month}-01`;
  const dayInPeriod = selectedDay != null && inPeriod(selectedDay);
  const activeDay = dayInPeriod ? selectedDay : fallbackDay;
  // 고른 날은 달력 탭에서, 보고 있는 기간 안에 있을 때만 주소에 남긴다.
  // 다른 탭으로 가거나 달(주)을 옮겨 그 날이 빠지면 주소에서도 지운다.
  const staleDay = selectedDay != null && (tab !== "calendar" || !dayInPeriod);
  useEffect(() => {
    if (staleDay) void setSelectedDay(null);
  }, [staleDay, setSelectedDay]);
  const defaultEntryDate = tab === "calendar" ? activeDay : fallbackDay;
  // 통계·반복·여행 탭은 월과 상관없는 화면이라 월 이동과 요약을 숨긴다.
  const hidesMonthSummary = tab === "stats" || tab === "recurring" || tab === "trips";
  const largePlacePhotos = useLedgerViewStore((state) => state.largePlacePhotos);
  const setLargePlacePhotos = useLedgerViewStore((state) => state.setLargePlacePhotos);
  const hasPlacePhotos = Boolean(
    ledger?.entries.some((entry) => entry.mapImageUrls.length > 0)
  );
  const showsCategoryFilter =
    tab === "stats" || tab === "calendar" || (tab === "list" && !deferredSearch);
  const monthLabel = formatMonthKo(month);
  const periodLabel = isWeek ? formatWeekKo(weekStart, today) : monthLabel;

  const goWeek = (start: string) => {
    setWeekStart(start);
    setMonth(weekMonth(start));
  };
  // 주 단위일 때 month는 늘 그 주가 속한 달이어야 한다. 통계 탭에서 달을 옮기면
  // 그 달에 속한 주(이번 달이면 이번 주, 아니면 첫 주)로 함께 옮긴다.
  const changeMonth = (next: string) => {
    setMonth(next);
    if (!isWeek) return;
    if (next === thisMonth) {
      setWeekStart(thisWeek);
      return;
    }
    const first = weekStartOf(`${next}-01`);
    setWeekStart(weekMonth(first) === next ? first : shiftWeek(first, 1));
  };
  const changePeriod = (next: LedgerPeriod) => {
    if (next === period) return;
    // 주로 바꿀 때는 보고 있던 날(달력에서 고른 날 등)이 든 주로 간다.
    if (next === "week") goWeek(weekStartOf(activeDay));
    setPeriod(next);
  };
  // 여행을 고르면, 지금 보는 기간이 여행 기간과 겹치지 않을 때 여행이 시작한 달(주)로 옮긴다.
  const changeTripScope = (next: TripScope) => {
    setExcludeTrips(next === "exclude");
    void setFocusedTripId(typeof next === "number" ? next : null);
    // 여행 고르기를 풀면 통계도 여행 리포트에서 원래 기간(월·주)으로 돌아간다.
    if (typeof next !== "number" && reportRange === "trip") void setReportRange(null);
    const trip =
      typeof next === "number"
        ? fullLedger?.trips.find((item) => item.id === next)
        : null;
    if (!trip) return;
    const from = isWeek ? weekStart : `${month}-01`;
    const to = isWeek
      ? kst(weekStart).add(6, "day").format("YYYY-MM-DD")
      : kst(`${month}-01`).endOf("month").format("YYYY-MM-DD");
    if (trip.startDate <= to && trip.endDate >= from) return;
    if (isWeek) goWeek(weekStartOf(trip.startDate));
    else setMonth(trip.startDate.slice(0, 7));
  };

  // 여행 탭의 "통계 보기": 그 여행을 고르고 통계 탭의 여행 리포트로 간다.
  const openTripStats = (tripId: number) => {
    changeTripScope(tripId);
    void setReportRange("trip");
    void setTab("stats");
  };

  // 예산 카드. 분류를 고르면 그 분류의 예산(설정에서 정한 분류별 예산)을 보여 준다.
  const budgetLabel = filterCategory ? `${filterCategory.name} 예산` : "예산";
  const totalBudget = filterCategory
    ? (ledger?.budget.byCategory.find((row) => row.categoryId === filterCategory.id)
        ?.amount ?? null)
    : (ledger?.budget.totalBudget ?? null);
  const budgetSpent = filterCategory
    ? (ledger?.byCategory.find((row) => row.categoryId === filterCategory.id)?.amount ??
      0)
    : (ledger?.summary.expense ?? 0);
  const budgetRemaining = totalBudget == null ? 0 : totalBudget - budgetSpent;
  const budgetUsedPct =
    totalBudget == null || totalBudget === 0
      ? 0
      : Math.round((budgetSpent / totalBudget) * 100);
  const pace = ledger
    ? getBudgetPace({ month, today, budget: totalBudget, spent: budgetSpent })
    : null;
  const isOverBudget = budgetRemaining < 0;

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

          {/* 분류 필터는 내역·달력·통계 탭이 함께 쓴다. 검색 결과는 전체 기간·분류를 보여 준다. */}
          {ledger && showsCategoryFilter && (
            <ExpenseCategoryChips
              label="분류 필터"
              categories={ledger.categories}
              selected={filterCategory?.id ?? "all"}
              onSelect={setCategoryFilter}
            />
          )}

          {!hidesMonthSummary && (
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {isWeek ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이전 주"
                    onClick={() => goWeek(shiftWeek(weekStart, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <WeekPicker weekStart={weekStart} onChange={goWeek} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="다음 주"
                    onClick={() => goWeek(shiftWeek(weekStart, 1))}
                  >
                    <ChevronRight />
                  </Button>
                  {weekStart !== thisWeek && (
                    <Button variant="ghost" size="sm" onClick={() => goWeek(thisWeek)}>
                      이번 주
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이전 달"
                    onClick={() => setMonth((current) => shiftMonth(current, -1))}
                  >
                    <ChevronLeft />
                  </Button>
                  <MonthPicker month={month} onChange={setMonth} />
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
                </>
              )}
              <ViewToggle
                label="기간 단위"
                options={PERIODS}
                value={period}
                onChange={changePeriod}
              />
              {fullLedger && hasTrips && (
                <TripScopePicker
                  trips={fullLedger.trips}
                  value={tripScope}
                  onChange={changeTripScope}
                />
              )}
              {/* 장소 사진이 있는 내역이 있을 때만 사진 크기를 고른다. */}
              {(tab === "list" || tab === "calendar") && hasPlacePhotos && (
                <ViewToggle
                  label="장소 사진 크기"
                  options={PLACE_PHOTO_SIZES}
                  value={largePlacePhotos ? "large" : "small"}
                  onChange={(value) => setLargePlacePhotos(value === "large")}
                />
              )}
            </div>
          )}
        </div>

        <div className={cn("mt-4", hidesMonthSummary && "hidden")}>
          {focusedTrip &&
            // 숨긴 탭에서도 DOM에 남지 않게 통계·반복·여행 탭에서는 그리지 않는다.
            !hidesMonthSummary && (
              <TripFocusCard trip={focusedTrip} onClose={() => changeTripScope("all")} />
            )}
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
                  value={formatWon(isWeek ? periodSummary.income : ledger.summary.income)}
                  hint={`${periodLabel} 입금`}
                  tone="success"
                />
                {filterCategory ? (
                  <SummaryCard
                    testId="summary-expense"
                    label={`${filterCategory.name} 지출`}
                    value={formatWon(categoryTotals.expense)}
                    hint={`${periodLabel} ${filterCategory.name} ${categoryTotals.count}건`}
                    tone="primary"
                  />
                ) : (
                  <SummaryCard
                    testId="summary-expense"
                    label="지출"
                    value={formatWon(
                      isWeek ? periodSummary.expense : ledger.summary.expense
                    )}
                    hint={`${periodLabel} 지출`}
                    tone="primary"
                  />
                )}
                {totalBudget == null ? (
                  <Card
                    data-testid="summary-budget"
                    className="rounded-2xl border border-hairline bg-surface py-4 ring-0"
                  >
                    <CardContent className="flex h-full flex-col justify-between px-4">
                      <div>
                        <p className="text-[11px] font-medium tracking-wide text-muted">
                          {budgetLabel}
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
                    testId="summary-budget"
                    label={budgetLabel}
                    value={
                      isOverBudget
                        ? `${formatWon(-budgetRemaining)} 초과`
                        : `${formatWon(budgetRemaining)} 남음`
                    }
                    hint={`${formatWon(totalBudget)} 중 ${budgetUsedPct}%`}
                    note={paceNote(pace)}
                    tone={isOverBudget ? "error" : undefined}
                    bar={{
                      pct: budgetUsedPct,
                      marker: pace?.state === "current" ? pace.elapsedPct : undefined,
                    }}
                  />
                )}
              </>
            )}
          </div>
          {/* 잔액·입금·지출·예산을 먼저 보고, 그 기간을 돌아보는 리캡은 그 아래에 둔다. */}
          {!focusedTrip && (
            <RecapCard
              period={period}
              weekStart={weekStart}
              month={month}
              excludeTrips={tripsExcluded}
              category={recapCategory}
            />
          )}
          {/* 분류를 골랐으면 그 분류의 예산은 위 예산 카드에 보인다. */}
          {ledger && !filterCategory && <CategoryBudgetCard ledger={ledger} />}
        </div>

        <div className="mt-6">
          {(isLoading && !ledger) || (periodPending && !otherQuery.isError) ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl border border-hairline bg-canvas-soft"
                />
              ))}
            </div>
          ) : (isError && !ledger) || (periodPending && otherQuery.isError) ? (
            <div className="rounded-2xl border border-hairline bg-surface px-6 py-10 text-center">
              <p className="text-sm font-medium text-ink">가계부를 불러오지 못했어요</p>
              <p className="mt-1 text-[12px] text-muted">
                {loadError instanceof Error
                  ? loadError.message
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => (isError ? refetch() : otherQuery.refetch())}
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

                  {!deferredSearch &&
                    filterCategory &&
                    (dayGroups.length > 0 || companionCategory) && (
                      <div className="space-y-0.5">
                        {dayGroups.length > 0 && (
                          <CategoryTotalLine
                            periodLabel={periodLabel}
                            name={filterCategory.name}
                            entries={listEntries}
                          />
                        )}
                        {companionCategory && (
                          <CategoryTotalLine
                            periodLabel={periodLabel}
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
                          onEdit={openEdit}
                        />
                      ) : (
                        <CategoryCard
                          total={isWeek ? periodSummary.expense : ledger.summary.expense}
                          byCategory={
                            isWeek ? periodSummary.byCategory : ledger.byCategory
                          }
                          entries={periodEntries}
                          onEdit={openEdit}
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
                              {periodLabel}
                              {filterCategory && ` · ${filterCategory.name}`}
                            </span>
                          </div>
                          <TopExpensesList
                            items={topExpenses}
                            onEdit={openEdit}
                            className="mt-2"
                          />
                        </section>
                      )}
                    </div>
                  )}

                  {deferredSearch ? (
                    <SearchResults query={deferredSearch} onEdit={openEdit} />
                  ) : filterCategory && !dayGroups.length ? (
                    <div className="rounded-2xl border border-hairline bg-surface px-6 py-10 text-center">
                      <p className="text-[13px] text-muted">
                        {periodLabel}에는 {filterCategory.name} 내역이 없어요
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
                        {tripsExcluded
                          ? `${periodLabel}에는 여행 말고 기록이 없어요`
                          : focusedTrip
                            ? `${periodLabel}에는 ${focusedTrip.name} 기록이 없어요`
                            : isWeek
                              ? "이 주에는 기록이 없어요"
                              : "아직 기록이 없어요"}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {tripsExcluded
                          ? "여행 제외를 끄면 여행 내역도 보여요"
                          : focusedTrip
                            ? "여행 기간이 든 달로 옮기거나 여행 보기를 꺼 보세요"
                            : "첫 지출을 남겨보세요"}
                      </p>
                      <Button className="mt-4" size="sm" onClick={openAdd}>
                        <Plus /> 내역 추가
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {tab === "calendar" && calendarLedger && (
                <CalendarView
                  ledger={calendarLedger}
                  weekStart={isWeek ? weekStart : null}
                  entries={listEntries}
                  calendar={calendarDays}
                  activeDay={activeDay}
                  onSelectDay={setSelectedDay}
                  onEdit={openEdit}
                />
              )}

              {tab === "recurring" && <RecurringTab ledger={fullLedger ?? ledger} />}

              {tab === "trips" && (
                <TripsTab ledger={fullLedger ?? ledger} onOpenStats={openTripStats} />
              )}

              {tab === "stats" && (
                <StatsView
                  categories={ledger.categories}
                  month={month}
                  onMonthChange={changeMonth}
                  initialPeriod={period}
                  weekStart={weekStart}
                  onWeekChange={goWeek}
                  trips={ledger.trips}
                  expenseReference={ledger.expenseReference}
                  totalBudget={ledger.budget.totalBudget}
                  onEdit={openEdit}
                  excludeTrips={tripsExcluded}
                  onExcludeTripsChange={(value) =>
                    changeTripScope(value ? "exclude" : "all")
                  }
                  tripId={focusedTrip?.id ?? null}
                  onTripChange={(id) => changeTripScope(id ?? "all")}
                  category={filterCategory}
                />
              )}
            </>
          ) : null}
        </div>
      </main>

      {fullLedger && (
        <>
          <EntryDialog
            open={entryOpen}
            onOpenChange={setEntryOpen}
            ledger={fullLedger}
            defaultDate={defaultEntryDate}
            entry={editingEntry}
          />
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            ledger={fullLedger}
            initialTab={settingsTab}
          />
          <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} />
        </>
      )}
    </SidebarLayout>
  );
};
