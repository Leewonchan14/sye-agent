import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { compareLedgerEntries, getLedgerMonth } from "@/lib/db/ledger";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { getBudgetPace } from "@/lib/ledger/pace";
import { lastCompletedWeek, type LedgerWeeklyRecap } from "@/lib/ledger/recap";

const TOP_EXPENSES = 3;
const TOP_CATEGORIES = 5;

const comments = schema.ledgerWeeklyComments;

/** 수치는 전부 여기서 계산한다. 하치와레는 이 결과에 코멘트만 단다. */
export const getLedgerWeeklyRecap = async (): Promise<LedgerWeeklyRecap> => {
  const today = kst().format("YYYY-MM-DD");
  const month = today.slice(0, 7);
  const week = lastCompletedWeek(today);

  const [current, previous, ledger, [stored]] = await Promise.all([
    getLedgerStats(week.from, week.to),
    getLedgerStats(week.previousFrom, week.previousTo),
    getLedgerMonth(month),
    getDb().select().from(comments).where(eq(comments.weekStart, week.from)).limit(1),
  ]);

  const expense = current.summary.expense;
  const total = ledger.budget.totalBudget;
  const pace = getBudgetPace({
    month,
    today,
    budget: total,
    spent: ledger.summary.expense,
  });

  return {
    from: week.from,
    to: week.to,
    expense,
    expenseCount: current.summary.expenseCount,
    previousExpense: previous.summary.expense,
    topExpenses: current.entries
      .filter((entry) => entry.kind === "expense")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, TOP_EXPENSES)
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        memo: entry.memo,
        amount: entry.amount,
        categoryName: entry.categoryName,
      })),
    items: current.entries
      .filter((entry) => entry.kind === "expense")
      .sort((a, b) => compareLedgerEntries(b, a))
      .map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        label: entry.memo || entry.categoryName || "내역",
        amount: entry.amount,
        categoryName: entry.categoryName,
      })),
    categories: current.byCategory
      .slice(0, TOP_CATEGORIES)
      .map(({ name, amount }) => ({ name, amount })),
    budget:
      total != null && pace
        ? { month, total, spent: ledger.summary.expense, pace }
        : null,
    comment: stored?.expense === expense ? stored.comment : null,
  };
};

const RETRY_HOURS = 6;

/**
 * 코멘트를 쓸 차례인지 한 문장으로 정한다. 합계가 바뀌었으면 바로,
 * 같은 합계로 실패했으면 몇 시간 뒤에만 다시 시도해 하치와레를 반복 호출하지 않는다.
 */
export const claimWeeklyRecapComment = async (
  weekStart: string,
  expense: number
): Promise<boolean> => {
  const rows = await getDb()
    .insert(comments)
    .values({ weekStart, expense })
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
export const saveWeeklyRecapComment = async (
  weekStart: string,
  expense: number,
  comment: string
) => {
  await getDb()
    .update(comments)
    .set({ comment })
    .where(and(eq(comments.weekStart, weekStart), eq(comments.expense, expense)));
};
