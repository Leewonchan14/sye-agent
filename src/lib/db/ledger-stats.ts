import { asc, lte } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { LedgerError } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import type { LedgerCategoryColorKey, LedgerCategoryIconKey } from "@/lib/ledger/icons";
import type { LedgerMember } from "@/lib/ledger/members";

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
  entries: {
    id: number;
    entryDate: string;
    kind: "income" | "expense";
    amount: number;
    memo: string;
    categoryId: number | null;
    categoryName: string | null;
    categoryIcon: LedgerCategoryIconKey | null;
    categoryColor: LedgerCategoryColorKey | null;
    assetName: string | null;
    member: LedgerMember;
  }[];
  allEntries: {
    id: number;
    entryDate: string;
    kind: "income" | "expense";
    amount: number;
    memo: string;
    categoryId: number | null;
    categoryName: string | null;
    categoryIcon: LedgerCategoryIconKey | null;
    categoryColor: LedgerCategoryColorKey | null;
    assetName: string | null;
    member: LedgerMember;
  }[];
  // 각 멤버의 count는 입금 건수
  byMember: {
    wonchan: { income: number; expense: number; count: number };
    yeeun: { income: number; expense: number; count: number };
    joint: { income: number; expense: number; count: number };
  };
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
  daily: { date: string; income: number; expense: number; balance: number }[];
  topMerchants: { name: string; amount: number; count: number }[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

const normalizeDate = (value: string, label: string): string => {
  if (!DATE_RE.test(value) || kst(value).format("YYYY-MM-DD") !== value) {
    throw new LedgerError(`${label} 형식이 올바르지 않아요.`);
  }
  return value;
};

/**
 * 가계부 통계. 오늘까지 전체 내역을 한 번만 읽고 분류/자산 테이블을 붙여
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

  if (from) from = normalizeDate(from, "시작 날짜");
  if (to) to = normalizeDate(to, "종료 날짜");

  const [entryRows, categoryRows, assetRows] = await Promise.all([
    db
      .select({
        id: schema.ledgerEntries.id,
        entryDate: schema.ledgerEntries.entryDate,
        kind: schema.ledgerEntries.kind,
        amount: schema.ledgerEntries.amount,
        categoryId: schema.ledgerEntries.categoryId,
        assetId: schema.ledgerEntries.assetId,
        memo: schema.ledgerEntries.memo,
        member: schema.ledgerEntries.member,
      })
      .from(schema.ledgerEntries)
      .where(lte(schema.ledgerEntries.entryDate, today))
      .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.id)),
    db
      .select({
        id: schema.ledgerCategories.id,
        name: schema.ledgerCategories.name,
        emoji: schema.ledgerCategories.emoji,
        icon: schema.ledgerCategories.icon,
        color: schema.ledgerCategories.color,
      })
      .from(schema.ledgerCategories),
    db
      .select({
        id: schema.ledgerAssets.id,
        name: schema.ledgerAssets.name,
      })
      .from(schema.ledgerAssets),
  ]);

  if (!from) from = entryRows[0]?.entryDate ?? today;
  if (!to) to = today;

  if (from > to) {
    throw new LedgerError("시작 날짜는 종료 날짜보다 늦을 수 없어요.");
  }

  const days = kst(to).diff(kst(from), "day") + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new LedgerError("조회 기간은 366일 이하로 선택해 주세요.");
  }

  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));

  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let allTimeIncome = 0;
  let allTimeExpense = 0;
  let allTimeIncomeCount = 0;
  let allTimeExpenseCount = 0;
  const entries: LedgerStats["entries"] = [];
  const allEntries: LedgerStats["allEntries"] = [];
  const byMember: LedgerStats["byMember"] = {
    wonchan: { income: 0, expense: 0, count: 0 },
    yeeun: { income: 0, expense: 0, count: 0 },
    joint: { income: 0, expense: 0, count: 0 },
  };
  const categoryTotals = new Map<number | null, number>();
  const monthlyTotals = new Map<string, { income: number; expense: number }>();
  const merchantTotals = new Map<string, { amount: number; count: number }>();
  const dailyTotals = new Map<string, { income: number; expense: number }>();

  const start = kst(from);
  for (let index = 0; index < days; index += 1) {
    const date = start.add(index, "day").format("YYYY-MM-DD");
    dailyTotals.set(date, { income: 0, expense: 0 });
  }

  for (const entry of entryRows) {
    const kind: "income" | "expense" = entry.kind === "income" ? "income" : "expense";
    const member: LedgerMember =
      entry.member === "yeeun" ? "yeeun" : entry.member === "joint" ? "joint" : "wonchan";
    const category = entry.categoryId == null ? null : categoryById.get(entry.categoryId);
    const asset = entry.assetId == null ? null : assetById.get(entry.assetId);
    const view = {
      id: entry.id,
      entryDate: entry.entryDate,
      kind,
      amount: entry.amount,
      memo: entry.memo,
      categoryId: entry.categoryId,
      categoryName: category?.name ?? null,
      categoryIcon: (category?.icon ?? null) as LedgerCategoryIconKey | null,
      categoryColor: (category?.color ?? null) as LedgerCategoryColorKey | null,
      assetName: asset?.name ?? null,
      member,
    };

    allEntries.push(view);

    if (kind === "income") {
      allTimeIncome += entry.amount;
      allTimeIncomeCount += 1;
    } else {
      allTimeExpense += entry.amount;
      allTimeExpenseCount += 1;
    }

    if (entry.entryDate < from || entry.entryDate > to) continue;

    entries.push(view);

    const month = entry.entryDate.slice(0, 7);
    const monthTotals = monthlyTotals.get(month) ?? { income: 0, expense: 0 };
    const dayTotals = dailyTotals.get(entry.entryDate);

    if (kind === "income") {
      income += entry.amount;
      incomeCount += 1;
      byMember[member].income += entry.amount;
      byMember[member].count += 1;
      monthTotals.income += entry.amount;
      if (dayTotals) dayTotals.income += entry.amount;
    } else {
      expense += entry.amount;
      expenseCount += 1;
      byMember[member].expense += entry.amount;
      monthTotals.expense += entry.amount;
      if (dayTotals) dayTotals.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );

      const merchantName = entry.memo.trim() || category?.name || "지출";
      const merchant = merchantTotals.get(merchantName) ?? { amount: 0, count: 0 };
      merchant.amount += entry.amount;
      merchant.count += 1;
      merchantTotals.set(merchantName, merchant);
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

  let balance = 0;
  const daily = [...dailyTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => {
      balance += totals.income - totals.expense;
      return { date, income: totals.income, expense: totals.expense, balance };
    });

  const topMerchants = [...merchantTotals.entries()]
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
    entries,
    allEntries,
    byMember,
    byCategory,
    monthly,
    daily,
    topMerchants,
  };
};
