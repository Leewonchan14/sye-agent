import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  compareLedgerEntries,
  getLedgerMonth,
  type LedgerEntryView,
} from "@/lib/db/ledger";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { getBudgetPace } from "@/lib/ledger/pace";
import { type LedgerRecap, type LedgerRecapPeriod, recapRange } from "@/lib/ledger/recap";
import { weekMonth } from "@/lib/ledger/week";

const TOP_EXPENSES = 3;
const TOP_CATEGORIES = 5;

const comments = schema.ledgerWeeklyComments;

const sumByName = (
  entries: LedgerEntryView[],
  nameOf: (entry: LedgerEntryView) => string
) => {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const name = nameOf(entry);
    totals.set(name, (totals.get(name) ?? 0) + entry.amount);
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
};

/**
 * 주(key = 월요일) 또는 달(key = YYYY-MM)의 리캡. 수치는 전부 여기서 계산하고,
 * 하치와레는 이 결과에 코멘트만 단다. 예산은 그 기간이 속한 달 것을 쓴다.
 * categoryId를 주면 그 분류의 지출만 세고, 예산도 그 분류의 예산으로 본다.
 */
export const getLedgerRecap = async (
  period: LedgerRecapPeriod,
  key: string,
  options: { excludeTrips?: boolean; categoryId?: number | null } = {}
): Promise<LedgerRecap> => {
  const { excludeTrips = false, categoryId = null } = options;
  const category = categoryId != null;
  const isExpense = (entry: LedgerEntryView) =>
    entry.kind === "expense" && (!category || entry.categoryId === categoryId);
  const sumOf = (entries: LedgerEntryView[]) =>
    entries.reduce((sum, entry) => sum + entry.amount, 0);
  const today = kst().format("YYYY-MM-DD");
  const month = period === "month" ? key : weekMonth(key);
  const range = recapRange(period, key, today);

  const [current, previous, ledger, [stored]] = await Promise.all([
    getLedgerStats(range.from, range.to, { excludeTrips }),
    getLedgerStats(range.previousFrom, range.previousTo, { excludeTrips }),
    getLedgerMonth(month),
    getDb().select().from(comments).where(eq(comments.weekStart, key)).limit(1),
  ]);

  const expenses = current.entries.filter(isExpense);
  const expense = category ? sumOf(expenses) : current.summary.expense;
  const expenseCount = category ? expenses.length : current.summary.expenseCount;
  const previousExpense = category
    ? sumOf(previous.entries.filter(isExpense))
    : previous.summary.expense;
  // 분류를 고르면 그 분류의 예산(설정에서 정한 분류별 예산)을 본다.
  const total = category
    ? (ledger.budget.byCategory.find((row) => row.categoryId === categoryId)?.amount ??
      null)
    : ledger.budget.totalBudget;
  // 여행을 빼고 볼 때는 예산 사용량도 여행 지출을 뺀 금액으로 본다.
  const spent =
    excludeTrips || category
      ? sumOf(
          ledger.entries.filter(
            (entry) => isExpense(entry) && (!excludeTrips || entry.tripId == null)
          )
        )
      : ledger.summary.expense;
  const pace = getBudgetPace({ month, today, budget: total, spent });

  return {
    period,
    key,
    from: range.from,
    to: range.to,
    inProgress: range.inProgress,
    expense,
    expenseCount,
    previousExpense,
    topExpenses: [...expenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_EXPENSES)
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        memo: entry.memo,
        amount: entry.amount,
        categoryName: entry.categoryName,
      })),
    items: [...expenses]
      .sort((a, b) => compareLedgerEntries(b, a))
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        label: entry.memo || entry.categoryName || "내역",
        amount: entry.amount,
        categoryName: entry.categoryName,
      })),
    // 분류를 골랐으면 그 안의 사용처(내용)별로 나눈다.
    categories: category
      ? sumByName(expenses, (entry) => entry.memo.trim() || "내역").slice(
          0,
          TOP_CATEGORIES
        )
      : current.byCategory
          .slice(0, TOP_CATEGORIES)
          .map(({ name, amount }) => ({ name, amount })),
    budget: total != null && pace ? { month, total, spent, pace } : null,
    // 하치와레 코멘트는 여행을 포함한 전체 합계를 보고 쓴 것이라 여행 제외나 분류를 골랐을 때는 숨긴다.
    comment:
      !excludeTrips && !category && !range.inProgress && stored?.expense === expense
        ? stored.comment
        : null,
  };
};

const RETRY_HOURS = 6;

/**
 * 코멘트를 쓸 차례인지 한 문장으로 정한다. 합계가 바뀌었으면 바로,
 * 같은 합계로 실패했으면 몇 시간 뒤에만 다시 시도해 하치와레를 반복 호출하지 않는다.
 */
export const claimRecapComment = async (
  key: string,
  expense: number
): Promise<boolean> => {
  const rows = await getDb()
    .insert(comments)
    .values({ weekStart: key, expense })
    .onConflictDoUpdate({
      target: comments.weekStart,
      set: { expense, comment: null, attemptedAt: sql`now()` },
      setWhere: sql`${comments.expense} <> ${expense}
        or (${comments.comment} is null
          and ${comments.attemptedAt} < now() - make_interval(hours => ${RETRY_HOURS}))`,
    })
    .returning();
  return rows.length > 0;
};

/** 쓰는 동안 합계가 또 바뀌었으면 저장하지 않는다. */
export const saveRecapComment = async (key: string, expense: number, comment: string) => {
  await getDb()
    .update(comments)
    .set({ comment })
    .where(and(eq(comments.weekStart, key), eq(comments.expense, expense)));
};
