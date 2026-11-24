import { and, asc, isNull, lte } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  attachReviews,
  compareLedgerEntries,
  getLedgerOpeningBalance,
  LedgerError,
  toLedgerEntryView,
  type LedgerEntryView,
} from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import type { LedgerCategoryColorKey, LedgerCategoryIconKey } from "@/lib/ledger/icons";

export type LedgerStats = {
  from: string;
  to: string;
  days: number;
  summary: {
    income: number;
    expense: number;
    net: number;
    avgDailyExpense: number;
    incomeCount: number;
    expenseCount: number;
  };
  allTime: {
    from: string | null;
    to: string | null;
    income: number;
    expense: number;
    net: number;
    incomeCount: number;
    expenseCount: number;
  };
  entries: LedgerEntryView[];
  byCategory: {
    categoryId: number | null;
    name: string;
    emoji: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
    amount: number;
    pct: number;
  }[];
  monthly: { month: string; income: number; expense: number }[];
  /**
   * balance는 시작 잔액부터 그날까지 누적한 통장 잔액이다.
   * expense는 잔액 계산용 실제 지출이고, spent는 여행 제외 필터를 반영한 리포트 지출이다.
   */
  daily: {
    date: string;
    income: number;
    expense: number;
    spent: number;
    balance: number;
  }[];
};

/** 날짜만(YYYY-MM-DD) 또는 날짜와 시각(YYYY-MM-DDTHH:mm, KST). */
const BOUND_RE = /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/;
/** 직접 고른 기간만 제한한다. 전체 보기는 기록이 쌓여도 실패하면 안 된다. */
const MAX_CUSTOM_RANGE_DAYS = 3660;

/** 기간 경계를 날짜와 시각(없으면 null)으로 나눈다. */
const parseBound = (
  value: string,
  label: string
): { date: string; time: string | null } => {
  const match = BOUND_RE.exec(value);
  const date = match?.[1];
  if (!date || kst(date).format("YYYY-MM-DD") !== date) {
    throw new LedgerError(`${label} 형식이 올바르지 않아요.`);
  }
  return { date, time: match[2] ? `${match[2]}:${match[3]}` : null };
};

/**
 * 가계부 통계. 오늘까지 전체 내역을 한 번만 읽고 분류 테이블을 붙여
 * 기간 집계와 전체 누적을 TypeScript에서 함께 계산한다.
 */
export const getLedgerStats = async (
  fromInput?: string | null,
  toInput?: string | null,
  options: { tripId?: number | null; excludeTrips?: boolean } = {}
): Promise<LedgerStats> => {
  const db = getDb();
  const today = kst().format("YYYY-MM-DD");

  const fromBound = fromInput?.trim() ? parseBound(fromInput.trim(), "시작 날짜") : null;
  const toBound = toInput?.trim() ? parseBound(toInput.trim(), "종료 날짜") : null;
  let from = fromBound?.date ?? null;
  let to = toBound?.date ?? null;
  // 직접 설정에서 시각까지 고르면 첫날·마지막 날 내역을 그 시각으로 자른다.
  // 시각을 모르는 내역(entryTime null)은 그날 안에 있는 것으로 본다.
  let fromTime = fromBound?.time ?? null;
  let toTime = toBound?.time ?? null;
  const hasExplicitFrom = Boolean(from);

  const [entryRows, categoryRows, openingBalance, tripRows] = await Promise.all([
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          isNull(schema.ledgerEntries.deletedAt),
          lte(schema.ledgerEntries.entryDate, today)
        )
      )
      .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.id)),
    db.select().from(schema.ledgerCategories),
    getLedgerOpeningBalance(),
    db.select().from(schema.ledgerTrips),
  ]);

  const trip =
    options.tripId == null
      ? null
      : (tripRows.find((row) => row.id === options.tripId) ?? null);
  if (options.tripId != null && !trip) {
    throw new LedgerError("여행을 찾을 수 없어요.");
  }
  if (trip) {
    from = trip.startDate;
    to = trip.endDate;
    fromTime = null;
    toTime = null;
  }

  if (!from) from = entryRows[0]?.entryDate ?? today;
  if (!to) to = today;

  if (`${from}T${fromTime ?? "00:00"}` > `${to}T${toTime ?? "23:59"}`) {
    throw new LedgerError("시작 날짜는 종료 날짜보다 늦을 수 없어요.");
  }

  const days = kst(to).diff(kst(from), "day") + 1;
  if (hasExplicitFrom && days > MAX_CUSTOM_RANGE_DAYS) {
    throw new LedgerError("조회 기간은 10년 이하로 선택해 주세요.");
  }

  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const tripById = new Map(tripRows.map((row) => [row.id, row]));

  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let allTimeIncome = 0;
  let allTimeExpense = 0;
  let allTimeIncomeCount = 0;
  let allTimeExpenseCount = 0;
  let balanceBeforeRange = openingBalance;
  const entries: LedgerEntryView[] = [];
  const categoryTotals = new Map<number | null, number>();
  const monthlyTotals = new Map<string, { income: number; expense: number }>();
  const dailyTotals = new Map<
    string,
    { income: number; expense: number; spent: number }
  >();

  const start = kst(from);
  for (let index = 0; !trip && index < days; index += 1) {
    const date = start.add(index, "day").format("YYYY-MM-DD");
    dailyTotals.set(date, { income: 0, expense: 0, spent: 0 });
  }

  for (const entry of entryRows) {
    const view = toLedgerEntryView(entry, categoryById, tripById);
    const isIncome = view.kind === "income";

    if (isIncome) {
      allTimeIncome += entry.amount;
      allTimeIncomeCount += 1;
    } else {
      allTimeExpense += entry.amount;
      allTimeExpenseCount += 1;
    }

    if (trip) {
      // 미리 결제한 항공권처럼 여행 기간 밖의 내역도 연결돼 있으면 포함한다.
      if (entry.tripId !== trip.id) continue;
    } else {
      const beforeFromTime =
        entry.entryDate === from &&
        fromTime != null &&
        entry.entryTime != null &&
        entry.entryTime < fromTime;
      if (entry.entryDate < from || beforeFromTime) {
        balanceBeforeRange += isIncome ? entry.amount : -entry.amount;
        continue;
      }
      const afterToTime =
        entry.entryDate === to &&
        toTime != null &&
        entry.entryTime != null &&
        entry.entryTime > toTime;
      if (entry.entryDate > to || afterToTime) continue;

      // 잔액 추이는 실제 통장 기준이라 여행 제외와 상관없이 모두 더한다.
      const dayTotals = dailyTotals.get(entry.entryDate);
      if (dayTotals) {
        if (isIncome) dayTotals.income += entry.amount;
        else dayTotals.expense += entry.amount;
      }
      if (options.excludeTrips && entry.tripId != null) continue;
      if (dayTotals && !isIncome) dayTotals.spent += entry.amount;
    }

    entries.push(view);

    const month = entry.entryDate.slice(0, 7);
    const monthTotals = monthlyTotals.get(month) ?? { income: 0, expense: 0 };

    if (isIncome) {
      income += entry.amount;
      incomeCount += 1;
      monthTotals.income += entry.amount;
    } else {
      expense += entry.amount;
      expenseCount += 1;
      monthTotals.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );
    }

    monthlyTotals.set(month, monthTotals);
  }

  const allTime = {
    from: entryRows[0]?.entryDate ?? null,
    to: entryRows[entryRows.length - 1]?.entryDate ?? null,
    income: allTimeIncome,
    expense: allTimeExpense,
    net: allTimeIncome - allTimeExpense,
    incomeCount: allTimeIncomeCount,
    expenseCount: allTimeExpenseCount,
  };

  const byCategory = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryId == null ? null : categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "분류 없음",
        emoji: category?.emoji ?? "🧾",
        icon: (category?.icon ?? "tag") as LedgerCategoryIconKey,
        color: (category?.color ?? "neutral") as LedgerCategoryColorKey,
        amount,
        pct: expense === 0 ? 0 : Math.round((amount / expense) * 100),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const monthly = [...monthlyTotals.entries()]
    .map(([month, totals]) => ({ month, ...totals }))
    .sort((a, b) => a.month.localeCompare(b.month));

  let balance = balanceBeforeRange;
  const daily = [...dailyTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => {
      balance += totals.income - totals.expense;
      return { date, ...totals, balance };
    });

  return {
    from,
    to,
    days,
    summary: {
      income,
      expense,
      net: income - expense,
      avgDailyExpense: Math.round(expense / days),
      incomeCount,
      expenseCount,
    },
    allTime,
    // 화면은 오래된 순으로 받아 뒤집어 쓴다.
    // 통계 내역 줄에서도 리뷰를 보고 바로 쓰게 리뷰를 붙인다.
    entries: await attachReviews(entries.sort((a, b) => compareLedgerEntries(b, a))),
    byCategory,
    monthly,
    daily,
  };
};
