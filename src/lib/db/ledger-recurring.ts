import { and, asc, eq, gte, ne } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import {
  activeEntry,
  assertCategoryKind,
  ensureJointAssetId,
  getTripRows,
  LedgerError,
  logEntryHistory,
  normalizeAmount,
  normalizeDate,
  normalizeEntryKind,
  normalizeId,
  normalizeMemo,
  normalizeOptionalId,
  resolveTripId,
  toEntryKind,
  type LedgerEntryKind,
} from "@/lib/db/ledger";
import { dayjs, kst } from "@/lib/kst";

export interface LedgerRecurringInput {
  kind?: unknown;
  amount?: unknown;
  categoryId?: unknown;
  memo?: unknown;
  dayOfMonth?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

const normalizeDay = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new LedgerError("반복일은 1일부터 31일까지 입력해 주세요.");
  }
  return value;
};

export const createLedgerRecurring = async (input: LedgerRecurringInput) => {
  const kind = normalizeEntryKind(input.kind);
  const categoryId = normalizeOptionalId(input.categoryId, "분류");
  await assertCategoryKind(categoryId, kind);
  const memo = normalizeMemo(input.memo);
  if (!memo) throw new LedgerError("반복 내용을 입력해 주세요.");
  const startDate = normalizeDate(input.startDate);
  const endDate = input.endDate ? normalizeDate(input.endDate) : null;
  if (endDate && startDate > endDate) {
    throw new LedgerError("시작일은 종료일보다 늦을 수 없어요.");
  }

  const [row] = await getDb()
    .insert(schema.ledgerRecurring)
    .values({
      kind,
      amount: normalizeAmount(input.amount),
      categoryId,
      memo,
      dayOfMonth: normalizeDay(input.dayOfMonth),
      startDate,
      endDate,
    })
    .returning();
  return row;
};

/** 다시 켤 때는 꺼져 있던 동안의 내역을 소급해서 만들지 않는다. */
export const setLedgerRecurringActive = async (input: {
  id?: unknown;
  active?: unknown;
}) => {
  const id = normalizeId(input.id, "반복 거래");
  if (typeof input.active !== "boolean") {
    throw new LedgerError("사용 여부를 확인해 주세요.");
  }
  const [row] = await getDb()
    .update(schema.ledgerRecurring)
    .set(
      input.active
        ? { active: true, lastDate: kst().format("YYYY-MM-DD") }
        : { active: false }
    )
    .where(eq(schema.ledgerRecurring.id, id))
    .returning();
  if (!row) throw new LedgerError("반복 거래를 찾을 수 없어요.");
  return row;
};

/** 규칙만 지운다. 이미 만들어진 내역은 남는다. */
export const deleteLedgerRecurring = async (input: { id?: unknown }) => {
  const id = normalizeId(input.id, "반복 거래");
  await getDb().delete(schema.ledgerRecurring).where(eq(schema.ledgerRecurring.id, id));
};

const nextMonth = (month: string) =>
  dayjs(`${month}-01`).add(1, "month").format("YYYY-MM");

/** 31일 규칙은 짧은 달에 말일로 당겨진다. */
const occurrenceIn = (month: string, dayOfMonth: number): string => {
  const lastDay = dayjs(`${month}-01`).daysInMonth();
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
};

const nextOccurrence = (rule: {
  startDate: string;
  lastDate: string | null;
  dayOfMonth: number;
}): string => {
  let month = (rule.lastDate ?? rule.startDate).slice(0, 7);
  let date = occurrenceIn(month, rule.dayOfMonth);
  while (date < rule.startDate || (rule.lastDate != null && date <= rule.lastDate)) {
    month = nextMonth(month);
    date = occurrenceIn(month, rule.dayOfMonth);
  }
  return date;
};

/**
 * 오늘까지 도래한 반복 거래를 내역으로 만든다. 가계부를 열 때마다 호출되므로
 * (규칙, 날짜) 유니크 인덱스로 동시 요청에도 한 번만 생성되게 한다.
 * 지운 내역이 되살아나지 않도록 진행 위치는 lastDate에 저장한다.
 */
export const materializeRecurring = async (): Promise<number> => {
  const db = getDb();
  const today = kst().format("YYYY-MM-DD");
  const rules = await db
    .select()
    .from(schema.ledgerRecurring)
    .where(eq(schema.ledgerRecurring.active, true));

  const due = rules.filter((rule) => {
    const date = nextOccurrence(rule);
    return date <= today && (!rule.endDate || date <= rule.endDate);
  });
  if (!due.length) return 0;

  const [assetId, trips] = await Promise.all([ensureJointAssetId(), getTripRows()]);
  let created = 0;
  for (const rule of due) {
    const kind = toEntryKind(rule.kind);
    let lastDate = rule.lastDate;
    let date = nextOccurrence(rule);
    while (date <= today && (!rule.endDate || date <= rule.endDate)) {
      const [entry] = await db
        .insert(schema.ledgerEntries)
        .values({
          entryDate: date,
          kind,
          amount: rule.amount,
          categoryId: rule.categoryId,
          assetId,
          member: "joint",
          tripId: resolveTripId(undefined, date, kind, trips),
          recurringId: rule.id,
          memo: rule.memo,
        })
        .onConflictDoNothing()
        .returning();
      if (entry) {
        created += 1;
        await logEntryHistory(entry.id, "create", "web", null, entry);
      }
      lastDate = date;
      date = nextOccurrence({ ...rule, lastDate });
    }

    if (lastDate !== rule.lastDate) {
      await db
        .update(schema.ledgerRecurring)
        .set({ lastDate })
        .where(eq(schema.ledgerRecurring.id, rule.id));
    }
  }
  return created;
};

export type LedgerRecurringCandidate = {
  memo: string;
  amount: number;
  kind: LedgerEntryKind;
  dayOfMonth: number;
  lastDate: string;
  categoryId: number | null;
};

const CANDIDATE_MONTHS = 3;
const CANDIDATE_MAX_DAY_SPREAD = 3;
const CANDIDATE_MAX_AGE_DAYS = 45;

/** 최근 3개월 연속으로 비슷한 날짜에 같은 금액이 나간 지출을 추천한다. */
export const getRecurringCandidates = async (): Promise<LedgerRecurringCandidate[]> => {
  const db = getDb();
  const today = kst();
  const since = today.subtract(6, "month").format("YYYY-MM-DD");
  const [rows, rules] = await Promise.all([
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          ne(schema.ledgerEntries.kind, "income"),
          ne(schema.ledgerEntries.memo, ""),
          gte(schema.ledgerEntries.entryDate, since)
        )
      )
      .orderBy(asc(schema.ledgerEntries.entryDate)),
    db
      .select()
      .from(schema.ledgerRecurring)
      .where(eq(schema.ledgerRecurring.active, true)),
  ]);

  const covered = new Set(rules.map((rule) => `${rule.memo}|${rule.amount}`));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.memo}|${row.amount}`;
    if (covered.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const candidates: LedgerRecurringCandidate[] = [];
  for (const group of groups.values()) {
    const latestByMonth = new Map(group.map((row) => [row.entryDate.slice(0, 7), row]));
    const months = [...latestByMonth.keys()].sort().slice(-CANDIDATE_MONTHS);
    if (months.length < CANDIDATE_MONTHS) continue;
    const consecutive = months.every(
      (month, index) => index === 0 || month === nextMonth(months[index - 1])
    );
    if (!consecutive) continue;
    // 한 달에 여러 번 사는 품목은 고정 지출이 아니다.
    if (group.filter((row) => months.includes(row.entryDate.slice(0, 7))).length > 3) {
      continue;
    }

    const recent = months.map((month) => latestByMonth.get(month)!);
    const days = recent
      .map((row) => Number(row.entryDate.slice(8)))
      .sort((a, b) => a - b);
    if (days[days.length - 1] - days[0] > CANDIDATE_MAX_DAY_SPREAD) continue;

    const last = recent[recent.length - 1];
    if (today.diff(kst(last.entryDate), "day") > CANDIDATE_MAX_AGE_DAYS) continue;

    candidates.push({
      memo: last.memo,
      amount: last.amount,
      kind: toEntryKind(last.kind),
      dayOfMonth: days[1],
      lastDate: last.entryDate,
      categoryId: last.categoryId,
    });
  }
  return candidates.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
};
