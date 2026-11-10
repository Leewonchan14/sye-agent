/**
 * 통계 인사이트 계산. DB를 모르는 순수 함수라 테스트에서 바로 부른다.
 * 머니노트의 인사이트를 모임통장 장부에 맞게 옮겼다(소분류·적금 이체가 없다).
 *
 * - 평소와 다른 지출: 이번 달 분류별 지출을 최근 6개월 같은 기간의 중앙값과 비교하고,
 *   같은 분류에서 유난히 큰 내역을 고른다.
 * - 고정비: 달마다 지출 중 고정비 비중과, 입금 중 쓰지 않고 남긴 비율을 낸다.
 */

import { shiftMonth } from "@/lib/ledger/format";

export type InsightEntry = {
  id: number;
  entryDate: string;
  kind: string;
  amount: number;
  categoryId: number | null;
  recurringId: number | null;
  tripId: number | null;
  memo: string;
};

export type InsightCategory = { id: number; name: string };

/* ─────────────── 날짜 ─────────────── */

const daysInMonth = (month: string): number => {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const isExpense = (entry: InsightEntry) => entry.kind === "expense";
const normalizeMemo = (memo: string) => memo.trim().replace(/\s+/g, " ");

const firstMonthOf = (entries: InsightEntry[]) =>
  entries.reduce<string | null>(
    (min, entry) =>
      min == null || entry.entryDate.slice(0, 7) < min
        ? entry.entryDate.slice(0, 7)
        : min,
    null
  );

/* ─────────────── 평소와 다른 지출 ─────────────── */

export const UNUSUAL_BASELINE_MONTHS = 6;
/** 비교할 달이 이보다 적으면 평소를 말할 수 없다. */
export const UNUSUAL_MIN_BASELINE_MONTHS = 3;
/** 분류 금액 차이가 이보다 작으면 알리지 않는다. */
export const UNUSUAL_MIN_DIFF = 50_000;
export const UNUSUAL_UP_RATIO = 1.5;
export const UNUSUAL_DOWN_RATIO = 0.5;
/** 큰 내역: 같은 분류 과거 내역 수, 중앙값 대비 배수, 최소 금액 */
export const OUTLIER_MIN_HISTORY = 5;
export const OUTLIER_RATIO = 3;
export const OUTLIER_MIN_AMOUNT = 30_000;
export const OUTLIER_HISTORY_MONTHS = 24;
export const OUTLIER_LIMIT = 5;

export type UnusualCategory = {
  categoryId: number | null;
  name: string;
  current: number;
  usual: number;
  diff: number;
  /** usual이 0이면 null */
  ratio: number | null;
  direction: "up" | "down";
};

export type UnusualEntry = {
  id: number;
  entryDate: string;
  memo: string;
  amount: number;
  categoryId: number | null;
  /** 비교한 분류 이름 */
  groupName: string;
  usual: number;
  ratio: number;
  historyCount: number;
  onTrip: boolean;
};

export type UnusualSpending = {
  month: string;
  /** 진행 중인 달이면 오늘 날짜(일), 끝난 달이면 null */
  throughDay: number | null;
  baselineMonths: string[];
  total: { current: number; usual: number; diff: number; ratio: number | null } | null;
  categories: UnusualCategory[];
  entries: UnusualEntry[];
};

/** 진행 중인 달은 오늘까지, 지난 달들도 같은 날까지만 센다. */
const cutoffDay = (month: string, throughDay: number | null) =>
  throughDay == null ? daysInMonth(month) : Math.min(throughDay, daysInMonth(month));

export const findUnusualSpending = (input: {
  month: string;
  today: string;
  entries: InsightEntry[];
  categories: InsightCategory[];
}): UnusualSpending => {
  const { month, today } = input;
  const throughDay = today.startsWith(`${month}-`) ? Number(today.slice(8, 10)) : null;
  const expenses = input.entries.filter(isExpense);
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));
  const nameOf = (categoryId: number | null) =>
    categoryId == null ? "분류 없음" : (categoryName.get(categoryId) ?? "분류 없음");

  // 기록을 시작하기 전의 빈 달은 '평소'에 넣지 않는다.
  const firstMonth = firstMonthOf(expenses);
  const baselineMonths = Array.from({ length: UNUSUAL_BASELINE_MONTHS }, (_, index) =>
    shiftMonth(month, index - UNUSUAL_BASELINE_MONTHS)
  ).filter((m) => firstMonth != null && m >= firstMonth);

  const inWindow = (entry: InsightEntry, m: string) =>
    entry.entryDate.startsWith(`${m}-`) &&
    Number(entry.entryDate.slice(8, 10)) <= cutoffDay(m, throughDay);

  const sumByCategory = (m: string) => {
    const totals = new Map<number | null, number>();
    for (const entry of expenses) {
      if (!inWindow(entry, m)) continue;
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amount);
    }
    return totals;
  };

  const current = sumByCategory(month);
  const baseline = baselineMonths.map(sumByCategory);
  const enoughBaseline = baselineMonths.length >= UNUSUAL_MIN_BASELINE_MONTHS;

  const categories: UnusualCategory[] = [];
  let total: UnusualSpending["total"] = null;
  if (enoughBaseline) {
    const ids = new Set<number | null>([
      ...current.keys(),
      ...baseline.flatMap((totals) => [...totals.keys()]),
    ]);
    for (const categoryId of ids) {
      const now = current.get(categoryId) ?? 0;
      const usual = median(baseline.map((totals) => totals.get(categoryId) ?? 0));
      const diff = now - usual;
      const ratio = usual === 0 ? null : now / usual;
      const up = diff >= UNUSUAL_MIN_DIFF && (ratio == null || ratio >= UNUSUAL_UP_RATIO);
      const down =
        -diff >= UNUSUAL_MIN_DIFF && ratio != null && ratio <= UNUSUAL_DOWN_RATIO;
      if (!up && !down) continue;
      categories.push({
        categoryId,
        name: nameOf(categoryId),
        current: now,
        usual,
        diff,
        ratio: ratio == null ? null : Math.round(ratio * 10) / 10,
        direction: up ? "up" : "down",
      });
    }
    // 더 쓴 분류를 먼저, 그 안에서는 차이가 큰 순서
    categories.sort(
      (a, b) =>
        (a.direction === "up" ? 0 : 1) - (b.direction === "up" ? 0 : 1) ||
        Math.abs(b.diff) - Math.abs(a.diff)
    );

    const sum = (totals: Map<number | null, number>) =>
      [...totals.values()].reduce((acc, value) => acc + value, 0);
    const now = sum(current);
    const usual = median(baseline.map(sum));
    total = {
      current: now,
      usual,
      diff: now - usual,
      ratio: usual === 0 ? null : Math.round((now / usual) * 100) / 100,
    };
  }

  // 큰 내역: 같은 분류의 지난 24개월 내역과 비교한다.
  const historyFrom = `${shiftMonth(month, -OUTLIER_HISTORY_MONTHS)}-01`;
  const monthStart = `${month}-01`;
  const history = new Map<number | null, number[]>();
  for (const entry of expenses) {
    if (entry.entryDate < historyFrom || entry.entryDate >= monthStart) continue;
    history.set(entry.categoryId, [
      ...(history.get(entry.categoryId) ?? []),
      entry.amount,
    ]);
  }

  const entries: UnusualEntry[] = [];
  for (const entry of expenses) {
    if (!entry.entryDate.startsWith(`${month}-`)) continue;
    if (entry.amount < OUTLIER_MIN_AMOUNT) continue;
    const past = history.get(entry.categoryId) ?? [];
    if (past.length < OUTLIER_MIN_HISTORY) continue;
    const usual = median(past);
    if (usual === 0 || entry.amount < usual * OUTLIER_RATIO) continue;
    // 과거에도 이만큼 쓴 적이 자주 있었다면 특별하지 않다.
    const asLarge = past.filter((amount) => amount >= entry.amount).length;
    if (asLarge / past.length > 0.1) continue;

    entries.push({
      id: entry.id,
      entryDate: entry.entryDate,
      memo: entry.memo,
      amount: entry.amount,
      categoryId: entry.categoryId,
      groupName: nameOf(entry.categoryId),
      usual,
      ratio: Math.round((entry.amount / usual) * 10) / 10,
      historyCount: past.length,
      onTrip: entry.tripId != null,
    });
  }
  entries.sort((a, b) => b.ratio - a.ratio || b.amount - a.amount);

  return {
    month,
    throughDay,
    baselineMonths: enoughBaseline ? baselineMonths : [],
    total,
    categories,
    entries: entries.slice(0, OUTLIER_LIMIT),
  };
};

/* ─────────────── 고정비 ─────────────── */

export const FIXED_TREND_MONTHS = 12;
/** 내용이 같은 지출이 연속 몇 달 이어지면 고정비로 볼지 */
export const FIXED_MIN_STREAK = 3;
/** 한 달에 평균 이보다 많이 나오면 자주 사는 것이지 고정비가 아니다. */
export const FIXED_MAX_PER_MONTH = 1.25;
/** 연속한 달의 금액이 가장 작은 달의 이 배수 안이어야 고정비다. */
export const FIXED_MAX_SPREAD = 1.5;

export type FixedReason = "recurring" | "pattern";

/**
 * 고정비로 볼 내용(메모) 목록. 반복 거래로 만든 내역과 반복 규칙의 내용은 그대로,
 * 나머지는 연속 3개월 이상 한 달에 한 번꼴로 비슷한 금액이 나간 내용이다.
 */
export const detectFixedMemos = (
  entries: InsightEntry[],
  recurringMemos: string[]
): Map<string, FixedReason> => {
  const fixed = new Map<string, FixedReason>();
  for (const memo of recurringMemos) {
    const key = normalizeMemo(memo);
    if (key) fixed.set(key, "recurring");
  }

  const groups = new Map<string, InsightEntry[]>();
  for (const entry of entries) {
    if (!isExpense(entry)) continue;
    const key = normalizeMemo(entry.memo);
    if (!key) continue;
    if (entry.recurringId != null) {
      fixed.set(key, "recurring");
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  for (const [key, group] of groups) {
    if (fixed.has(key)) continue;
    const byMonth = new Map<string, number>();
    for (const entry of group) {
      const m = entry.entryDate.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + entry.amount);
    }
    const months = [...byMonth.keys()].sort();
    if (group.length / months.length > FIXED_MAX_PER_MONTH) continue;

    // 요금이 바뀌어도 고정비다. 연속한 3개월의 금액이 비슷했던 적이 있으면 된다.
    const steadyStreak = months.some((_, start) => {
      const window = months.slice(start, start + FIXED_MIN_STREAK);
      if (window.length < FIXED_MIN_STREAK) return false;
      const consecutive = window.every(
        (m, index) => index === 0 || m === shiftMonth(window[index - 1], 1)
      );
      if (!consecutive) return false;
      const amounts = window.map((m) => byMonth.get(m)!);
      return Math.max(...amounts) <= Math.min(...amounts) * FIXED_MAX_SPREAD;
    });
    if (!steadyStreak) continue;
    fixed.set(key, "pattern");
  }
  return fixed;
};

export type FixedCostMonth = {
  month: string;
  income: number;
  expense: number;
  fixed: number;
  /** 고정비 / 지출. 지출이 0이면 null */
  fixedShare: number | null;
  /** (입금 - 지출) / 입금. 입금이 없으면 null, 더 썼으면 음수 */
  keptRate: number | null;
};

export type FixedCostInsight = {
  month: string;
  months: FixedCostMonth[];
  /** 선택한 달의 고정비 내역, 큰 순 */
  fixedItems: { memo: string; amount: number; count: number; reason: FixedReason }[];
};

const pct = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

export const buildFixedCostInsight = (input: {
  month: string;
  entries: InsightEntry[];
  recurringMemos: string[];
}): FixedCostInsight => {
  const { month, entries } = input;
  const fixedMemos = detectFixedMemos(entries, input.recurringMemos);
  const fixedReason = (entry: InsightEntry): FixedReason | null =>
    entry.recurringId != null
      ? "recurring"
      : (fixedMemos.get(normalizeMemo(entry.memo)) ?? null);

  const firstMonth = firstMonthOf(entries);
  const monthKeys = Array.from({ length: FIXED_TREND_MONTHS }, (_, index) =>
    shiftMonth(month, index - FIXED_TREND_MONTHS + 1)
  ).filter((m) => firstMonth != null && m >= firstMonth);

  const totals = new Map(monthKeys.map((m) => [m, { income: 0, expense: 0, fixed: 0 }]));
  const fixedItems = new Map<
    string,
    { memo: string; amount: number; count: number; reason: FixedReason }
  >();

  for (const entry of entries) {
    const m = entry.entryDate.slice(0, 7);
    const row = totals.get(m);
    if (!row) continue;
    if (entry.kind === "income") {
      row.income += entry.amount;
      continue;
    }
    if (!isExpense(entry)) continue;
    row.expense += entry.amount;
    const reason = fixedReason(entry);
    if (!reason) continue;
    row.fixed += entry.amount;
    if (m !== month) continue;
    const key = normalizeMemo(entry.memo);
    const item = fixedItems.get(key) ?? { memo: key, amount: 0, count: 0, reason };
    item.amount += entry.amount;
    item.count += 1;
    fixedItems.set(key, item);
  }

  return {
    month,
    months: monthKeys.map((m) => {
      const row = totals.get(m)!;
      return {
        month: m,
        ...row,
        fixedShare: pct(row.fixed, row.expense),
        keptRate: row.income === 0 ? null : pct(row.income - row.expense, row.income),
      };
    }),
    fixedItems: [...fixedItems.values()].sort((a, b) => b.amount - a.amount),
  };
};
