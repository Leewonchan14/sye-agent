import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { compareLedgerEntries, getLedgerMonth } from "@/lib/db/ledger";
import { getLedgerStats } from "@/lib/db/ledger-stats";
import { kst } from "@/lib/kst";
import { getBudgetPace } from "@/lib/ledger/pace";
import { type LedgerRecap, type LedgerRecapPeriod, recapRange } from "@/lib/ledger/recap";
import { weekMonth } from "@/lib/ledger/week";

const TOP_EXPENSES = 3;
const TOP_CATEGORIES = 5;

const comments = schema.ledgerWeeklyComments;

/**
 * 주(key = 월요일) 또는 달(key = YYYY-MM)의 리캡. 수치는 전부 여기서 계산하고,
 * 하치와레는 이 결과에 코멘트만 단다. 예산은 그 기간이 속한 달 것을 쓴다.
 */
export const getLedgerRecap = async (
  period: LedgerRecapPeriod,
  key: string,
  options: { excludeTrips?: boolean } = {}
): Promise<LedgerRecap> => {
  const { excludeTrips = false } = options;
  const today = kst().format("YYYY-MM-DD");
  const month = period === "month" ? key : weekMonth(key);
  const range = recapRange(period, key, today);

  const [current, previous, ledger, [stored]] = await Promise.all([
    getLedgerStats(range.from, range.to, { excludeTrips }),
    getLedgerStats(range.previousFrom, range.previousTo, { excludeTrips }),
    getLedgerMonth(month),
    getDb().select().from(comments).where(eq(comments.weekStart, key)).limit(1),
  ]);

  const expense = current.summary.expense;
  const total = ledger.budget.totalBudget;
  // 여행을 빼고 볼 때는 예산 사용량도 여행 지출을 뺀 금액으로 본다.
  const spent = excludeTrips
    ? ledger.entries
        .filter((entry) => entry.kind === "expense" && entry.tripId == null)
        .reduce((sum, entry) => sum + entry.amount, 0)
    : ledger.summary.expense;
  const pace = getBudgetPace({ month, today, budget: total, spent });

  return {
    period,
    key,
    from: range.from,
    to: range.to,
    inProgress: range.inProgress,
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
    budget: total != null && pace ? { month, total, spent, pace } : null,
    // 하치와레 코멘트는 여행을 포함한 전체 합계를 보고 쓴 것이라 여행 제외일 때는 숨긴다.
    comment:
      !excludeTrips && !range.inProgress && stored?.expense === expense
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
