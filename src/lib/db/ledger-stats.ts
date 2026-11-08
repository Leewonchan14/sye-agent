import { and, asc, isNull, lte } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
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
  /** balance는 시작 잔액부터 그날까지 누적한 통장 잔액이다. */
  daily: { date: string; income: number; expense: number; balance: number }[];
  topExpenses: { name: string; amount: number; count: number }[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 직접 고른 기간만 제한한다. 전체 보기는 기록이 쌓여도 실패하면 안 된다. */
const MAX_CUSTOM_RANGE_DAYS = 3660;

const normalizeDate = (value: string, label: string): string => {
  if (!DATE_RE.test(value) || kst(value).format("YYYY-MM-DD") !== value) {
    throw new LedgerError(`${label} 형식이 올바르지 않아요.`);
  }
  return value;
};

/**
 * 가계부 통계. 오늘까지 전체 내역을 한 번만 읽고 분류 테이블을 붙여
 * 기간 집계와 전체 누적을 TypeScript에서 함께 계산한다.
 */
export const getLedgerStats = async (
  fromInput?: string | null,
  toInput?: string | null
): Promise<LedgerStats> => {
  const db = getDb();
  const today = kst().format("YYYY-MM-DD");

  let from = fromInput?.trim() || null;
  let to = toInput?.trim() || null;
  const hasExplicitFrom = Boolean(from);

  if (from) from = normalizeDate(from, "시작 날짜");
  if (to) to = normalizeDate(to, "종료 날짜");

  const [entryRows, categoryRows, openingBalance] = await Promise.all([
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
  ]);

  if (!from) from = entryRows[0]?.entryDate ?? today;
  if (!to) to = today;

  if (from > to) {
    throw new LedgerError("시작 날짜는 종료 날짜보다 늦을 수 없어요.");
  }

  const days = kst(to).diff(kst(from), "day") + 1;
  if (hasExplicitFrom && days > MAX_CUSTOM_RANGE_DAYS) {
    throw new LedgerError("조회 기간은 10년 이하로 선택해 주세요.");
  }

  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));

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
  const expenseTotals = new Map<string, { amount: number; count: number }>();
  const dailyTotals = new Map<string, { income: number; expense: number }>();

  const start = kst(from);
  for (let index = 0; index < days; index += 1) {
    const date = start.add(index, "day").format("YYYY-MM-DD");
    dailyTotals.set(date, { income: 0, expense: 0 });
  }

  for (const entry of entryRows) {
    const view = toLedgerEntryView(entry, categoryById);
    const isIncome = view.kind === "income";

    if (isIncome) {
      allTimeIncome += entry.amount;
      allTimeIncomeCount += 1;
    } else {
      allTimeExpense += entry.amount;
      allTimeExpenseCount += 1;
    }

    if (entry.entryDate < from) {
      balanceBeforeRange += isIncome ? entry.amount : -entry.amount;
      continue;
    }
    if (entry.entryDate > to) continue;

    entries.push(view);

    const month = entry.entryDate.slice(0, 7);
    const monthTotals = monthlyTotals.get(month) ?? { income: 0, expense: 0 };
    const dayTotals = dailyTotals.get(entry.entryDate);

    if (isIncome) {
      income += entry.amount;
      incomeCount += 1;
      monthTotals.income += entry.amount;
      if (dayTotals) dayTotals.income += entry.amount;
    } else {
      expense += entry.amount;
      expenseCount += 1;
      monthTotals.expense += entry.amount;
      if (dayTotals) dayTotals.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );

      const name = view.memo.trim() || view.categoryName || "지출";
      const totals = expenseTotals.get(name) ?? { amount: 0, count: 0 };
      totals.amount += entry.amount;
      totals.count += 1;
      expenseTotals.set(name, totals);
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
      return { date, income: totals.income, expense: totals.expense, balance };
    });

  const topExpenses = [...expenseTotals.entries()]
    .map(([name, totals]) => ({ name, amount: totals.amount, count: totals.count }))
    .sort(
      (a, b) => b.amount - a.amount || b.count - a.count || a.name.localeCompare(b.name)
    )
    .slice(0, 8);

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
    entries: entries.sort((a, b) => compareLedgerEntries(b, a)),
    byCategory,
    monthly,
    daily,
    topExpenses,
  };
};
