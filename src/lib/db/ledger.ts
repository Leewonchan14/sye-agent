import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { dayjs, kst } from "@/lib/kst";
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_STYLES,
  defaultCategoryColor,
  isCategoryColorKey,
  isCategoryIconKey,
  suggestCategoryIcon,
  type LedgerCategoryColorKey,
  type LedgerCategoryIconKey,
} from "@/lib/ledger/icons";
import { suggestLedgerCategoryName } from "@/lib/ledger/notification";

export type LedgerEntryKind = "expense" | "income";
export type LedgerEntrySource = "web" | "agent";

export type LedgerEntryView = {
  id: number;
  entryDate: string;
  entryTime: string | null;
  kind: LedgerEntryKind;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryEmoji: string | null;
  categoryIcon: LedgerCategoryIconKey | null;
  categoryColor: LedgerCategoryColorKey | null;
  memo: string;
  tags: string;
};

export type LedgerAccountView = {
  openingBalance: number;
  /** 시작 잔액 + 오늘까지의 입금 - 지출 */
  currentBalance: number;
  checkedBalance: number | null;
  checkedAt: string | null;
};

export type LedgerMonthPayload = {
  month: string;
  prevMonth: string;
  nextMonth: string;
  account: LedgerAccountView;
  categories: {
    id: number;
    name: string;
    kind: LedgerEntryKind;
    emoji: string;
    icon: LedgerCategoryIconKey;
    color: LedgerCategoryColorKey;
    sortOrder: number;
    entryCount: number;
  }[];
  entries: LedgerEntryView[];
  /** 이 달 이전 3개월 중 지출이 있던 달의 평균. 예산을 정할 때 참고한다. */
  expenseReference: {
    months: number;
    average: number | null;
    byCategory: { categoryId: number | null; average: number }[];
  };
  budget: {
    totalBudget: number | null;
    note: string;
    byCategory: { categoryId: number; amount: number }[];
  };
  summary: {
    income: number;
    expense: number;
    balance: number;
    budgetRemaining: number | null;
    budgetUsedPct: number | null;
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
  calendar: { date: string; expense: number; income: number }[];
};

export interface LedgerEntryInput {
  entryDate: string;
  entryTime?: string | null;
  kind: LedgerEntryKind;
  amount: number;
  categoryId?: number | null;
  memo?: string;
  tags?: string;
}

export interface LedgerBulkEntryInput extends Omit<LedgerEntryInput, "categoryId"> {
  categoryId?: number | null;
  categoryName?: string | null;
}

export interface LedgerBudgetInput {
  month: string;
  totalBudget: number | null;
  note?: string;
  categories?: { categoryId: number; amount: number }[];
}

export interface LedgerCategoryInput {
  name: string;
  kind: LedgerEntryKind;
  emoji?: string;
  icon?: LedgerCategoryIconKey;
  color?: LedgerCategoryColorKey;
}

export interface LedgerCategoryUpdate {
  id: number;
  name?: string;
  emoji?: string;
  icon?: LedgerCategoryIconKey;
  color?: LedgerCategoryColorKey;
}

export interface LedgerAccountInput {
  openingBalance?: number;
  actualBalance?: number;
}

export type LedgerHistoryItem = {
  id: number;
  entryId: number;
  action: "create" | "update" | "delete" | "restore";
  source: LedgerEntrySource;
  createdAt: string;
  entryDate: string;
  kind: LedgerEntryKind;
  amount: number;
  memo: string;
  canRestore: boolean;
};

/** API 밖으로 나가면 400으로 변환되는 검증 오류. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

const MAX_AMOUNT = 1_000_000_000;
const MAX_BALANCE = 2_000_000_000;
const MAX_BULK_ENTRIES = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ACCOUNT_ID = 1;
const JOINT_ASSET_NAME = "모임 통장";
const LEGACY_ACCOUNT_TAGS = new Set(["모임통장", JOINT_ASSET_NAME]);

const DEFAULT_EXPENSE_CATEGORIES = [
  ["식비", "🍚"],
  ["카페", "☕"],
  ["교통", "🚌"],
  ["생활", "🛒"],
  ["쇼핑", "🛍️"],
  ["문화", "🎬"],
  ["의료", "💊"],
  ["주거", "🏠"],
  ["숙박", "🏨"],
  ["여행·항공", "✈️"],
  ["기타", "🧾"],
] as const;

const DEFAULT_INCOME_CATEGORIES = [
  ["급여", "💰"],
  ["용돈", "🎁"],
  ["이자", "🏦"],
  ["기타", "➕"],
] as const;

const normalizeId = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new LedgerError(`${label}가 올바르지 않아요.`);
  }
  return value;
};

const normalizeOptionalId = (value: unknown, label: string): number | null => {
  if (value == null) return null;
  return normalizeId(value, label);
};

const normalizeEntryKind = (value: unknown): LedgerEntryKind => {
  if (value !== "expense" && value !== "income") {
    throw new LedgerError("입금/지출 구분을 확인해 주세요.");
  }
  return value;
};

const normalizeName = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new LedgerError(`${label} 이름을 입력해 주세요.`);
  }
  return value.trim();
};

const normalizeEmoji = (value: unknown): string => {
  if (value === undefined) return "🧾";
  if (typeof value !== "string") throw new LedgerError("이모지를 확인해 주세요.");
  return value.trim() || "🧾";
};

const normalizeCategoryIcon = (value: unknown): LedgerCategoryIconKey => {
  if (!isCategoryIconKey(value)) throw new LedgerError("분류 아이콘을 확인해 주세요.");
  return value;
};

const normalizeCategoryColor = (value: unknown): LedgerCategoryColorKey => {
  if (!isCategoryColorKey(value)) throw new LedgerError("분류 색상을 확인해 주세요.");
  return value;
};

const normalizeMemo = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("내용을 확인해 주세요.");
  const memo = value.trim();
  if (memo.length > 200) throw new LedgerError("내용은 200자 이하로 입력해 주세요.");
  return memo;
};

const normalizeTags = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("태그를 확인해 주세요.");
  const tags = value.trim();
  if (tags.length > 100) throw new LedgerError("태그는 100자 이하로 입력해 주세요.");
  return tags;
};

const normalizeAmount = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AMOUNT
  ) {
    throw new LedgerError("금액은 1원 이상 10억 원 이하로 입력해 주세요.");
  }
  return value;
};

const normalizeTotalBudget = (value: unknown): number | null => {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_AMOUNT
  ) {
    throw new LedgerError("예산은 0원 이상 10억 원 이하로 입력해 주세요.");
  }
  return value;
};

const normalizeBalance = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    Math.abs(value) > MAX_BALANCE
  ) {
    throw new LedgerError("잔액을 확인해 주세요.");
  }
  return value;
};

const normalizeMonth = (value: unknown): string => {
  if (typeof value !== "string" || !MONTH_RE.test(value)) {
    throw new LedgerError("월 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeDate = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !DATE_RE.test(value) ||
    kst(value).format("YYYY-MM-DD") !== value ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  ) {
    throw new LedgerError("날짜 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeTime = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    throw new LedgerError("시각 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeNote = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "string") throw new LedgerError("메모를 확인해 주세요.");
  return value.trim();
};

const toEntryKind = (kind: string): LedgerEntryKind =>
  kind === "income" ? "income" : "expense";

/** neon-http와 node-postgres 양쪽에서 쓰는 단일 SQL 실행. 한 문장이라 원자적이다. */
const executeStatement = async (statement: SQL): Promise<void> => {
  const db = getDb() as unknown as { execute: (query: SQL) => Promise<unknown> };
  await db.execute(statement);
};

const activeEntry = isNull(schema.ledgerEntries.deletedAt);

type EntryRow = typeof schema.ledgerEntries.$inferSelect;
type CategoryRef = { name: string; emoji: string; icon: string; color: string };

/**
 * 예전 가져오기 데이터는 태그 칸에 시각(15:52)과 "모임통장"을 넣었다.
 * 읽을 때 시각 칸으로 옮기고, 이제 뜻이 없는 통장 태그는 뺀다.
 */
const readEntryExtras = (entryTime: string | null, tags: string) => {
  let time = entryTime;
  const kept: string[] = [];
  for (const raw of tags.split(",")) {
    const tag = raw.trim();
    if (!tag || LEGACY_ACCOUNT_TAGS.has(tag)) continue;
    if (TIME_RE.test(tag)) {
      time ??= tag;
      continue;
    }
    kept.push(tag);
  }
  return { entryTime: time, tags: kept.join(", ") };
};

export const toLedgerEntryView = (
  entry: EntryRow,
  categoryById: Map<number, CategoryRef>
): LedgerEntryView => {
  const category = entry.categoryId == null ? null : categoryById.get(entry.categoryId);
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    ...readEntryExtras(entry.entryTime, entry.tags),
    kind: toEntryKind(entry.kind),
    amount: entry.amount,
    categoryId: entry.categoryId,
    categoryName: category?.name ?? null,
    categoryEmoji: category?.emoji ?? null,
    categoryIcon: (category?.icon ?? null) as LedgerCategoryIconKey | null,
    categoryColor: (category?.color ?? null) as LedgerCategoryColorKey | null,
    memo: entry.memo,
  };
};

/** 최신순: 날짜, 시각(없으면 뒤로), id */
export const compareLedgerEntries = (
  a: Pick<LedgerEntryView, "id" | "entryDate" | "entryTime">,
  b: Pick<LedgerEntryView, "id" | "entryDate" | "entryTime">
): number =>
  b.entryDate.localeCompare(a.entryDate) ||
  (b.entryTime ?? "").localeCompare(a.entryTime ?? "") ||
  b.id - a.id;

const logEntryHistory = async (
  entryId: number,
  action: LedgerHistoryItem["action"],
  source: LedgerEntrySource,
  before: EntryRow | null,
  after: EntryRow | null
): Promise<void> => {
  try {
    await getDb()
      .insert(schema.ledgerEntryHistory)
      .values({ entryId, action, source, before, after });
  } catch (error) {
    // 이력 기록 실패가 사용자의 저장을 되돌리면 안 된다.
    console.error("[ledger] failed to write history:", error);
  }
};

/**
 * 분류 테이블이 비어 있을 때만 기본값을 넣는다.
 * 여러 요청이 동시에 들어와도 unique 인덱스 덕분에 안전하다.
 */
export const ensureLedgerDefaults = async (): Promise<void> => {
  const db = getDb();

  const [categoryCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.ledgerCategories);

  if (categoryCount?.value) return;

  await db
    .insert(schema.ledgerCategories)
    .values([
      ...DEFAULT_EXPENSE_CATEGORIES.map(([name, emoji], index) => {
        const style = DEFAULT_CATEGORY_STYLES[name] ?? {
          icon: suggestCategoryIcon(name),
          color: defaultCategoryColor(suggestCategoryIcon(name)),
        };
        return {
          name,
          emoji,
          kind: "expense" as const,
          icon: style.icon,
          color: style.color,
          sortOrder: index,
        };
      }),
      ...DEFAULT_INCOME_CATEGORIES.map(([name, emoji], index) => {
        const style =
          name === "기타"
            ? { icon: "plus" as const, color: "neutral" as const }
            : (DEFAULT_CATEGORY_STYLES[name] ?? {
                icon: suggestCategoryIcon(name),
                color: defaultCategoryColor(suggestCategoryIcon(name)),
              });
        return {
          name,
          emoji,
          kind: "income" as const,
          icon: style.icon,
          color: style.color,
          sortOrder: index,
        };
      }),
    ])
    .onConflictDoNothing();
};

/** 오늘까지 기록의 순증감(입금 - 지출). */
const getNetThroughToday = async (): Promise<number> => {
  const [row] = await getDb()
    .select({
      value: sql<number>`coalesce(sum(case when ${schema.ledgerEntries.kind} = 'income' then ${schema.ledgerEntries.amount} else -${schema.ledgerEntries.amount} end), 0)::bigint`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(activeEntry, lte(schema.ledgerEntries.entryDate, kst().format("YYYY-MM-DD")))
    );
  return Number(row?.value ?? 0);
};

export const getLedgerOpeningBalance = async (): Promise<number> => {
  const [row] = await getDb()
    .select({ openingBalance: schema.ledgerAccount.openingBalance })
    .from(schema.ledgerAccount)
    .where(eq(schema.ledgerAccount.id, ACCOUNT_ID))
    .limit(1);
  return row?.openingBalance ?? 0;
};

export const getLedgerAccount = async (): Promise<LedgerAccountView> => {
  const [[row], net] = await Promise.all([
    getDb()
      .select()
      .from(schema.ledgerAccount)
      .where(eq(schema.ledgerAccount.id, ACCOUNT_ID))
      .limit(1),
    getNetThroughToday(),
  ]);
  const openingBalance = row?.openingBalance ?? 0;
  return {
    openingBalance,
    currentBalance: openingBalance + net,
    checkedBalance: row?.checkedBalance ?? null,
    checkedAt: row?.checkedAt?.toISOString() ?? null,
  };
};

/** 시작 잔액을 직접 정하거나, 실제 통장 잔액에 맞도록 시작 잔액을 조정한다. */
export const saveLedgerAccount = async (
  input: LedgerAccountInput
): Promise<LedgerAccountView> => {
  const db = getDb();
  const now = new Date();

  if (input.actualBalance !== undefined) {
    const actualBalance = normalizeBalance(input.actualBalance);
    const openingBalance = normalizeBalance(actualBalance - (await getNetThroughToday()));
    const values = {
      openingBalance,
      checkedBalance: actualBalance,
      checkedAt: now,
      updatedAt: now,
    };
    await db
      .insert(schema.ledgerAccount)
      .values({ id: ACCOUNT_ID, ...values })
      .onConflictDoUpdate({ target: schema.ledgerAccount.id, set: values });
    return getLedgerAccount();
  }

  if (input.openingBalance === undefined) {
    throw new LedgerError("잔액을 입력해 주세요.");
  }
  const openingBalance = normalizeBalance(input.openingBalance);
  await db
    .insert(schema.ledgerAccount)
    .values({ id: ACCOUNT_ID, openingBalance, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.ledgerAccount.id,
      set: { openingBalance, updatedAt: now },
    });
  return getLedgerAccount();
};

const getCategoryRows = () =>
  getDb()
    .select()
    .from(schema.ledgerCategories)
    .orderBy(asc(schema.ledgerCategories.sortOrder), asc(schema.ledgerCategories.id));

export const getLedgerMonth = async (month: string): Promise<LedgerMonthPayload> => {
  const validMonth = normalizeMonth(month);
  await ensureLedgerDefaults();

  const db = getDb();
  const monthStart = `${validMonth}-01`;
  const monthEnd = `${validMonth}-31`;

  const referenceStart = dayjs(monthStart).subtract(3, "month").format("YYYY-MM-DD");
  const referenceMonth = sql<string>`substr(${schema.ledgerEntries.entryDate}, 1, 7)`;

  const [
    categoryRows,
    entryRows,
    monthRows,
    budgetRows,
    usageRows,
    account,
    referenceRows,
  ] = await Promise.all([
    getCategoryRows(),
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          gte(schema.ledgerEntries.entryDate, monthStart),
          lte(schema.ledgerEntries.entryDate, monthEnd)
        )
      )
      .orderBy(desc(schema.ledgerEntries.entryDate), desc(schema.ledgerEntries.id)),
    db
      .select()
      .from(schema.ledgerMonths)
      .where(eq(schema.ledgerMonths.month, validMonth))
      .limit(1),
    db
      .select()
      .from(schema.ledgerBudgets)
      .where(eq(schema.ledgerBudgets.month, validMonth)),
    db
      .select({
        categoryId: schema.ledgerEntries.categoryId,
        value: sql<number>`count(*)::int`,
      })
      .from(schema.ledgerEntries)
      .groupBy(schema.ledgerEntries.categoryId),
    getLedgerAccount(),
    db
      .select({
        month: referenceMonth,
        categoryId: schema.ledgerEntries.categoryId,
        amount: sql<number>`sum(${schema.ledgerEntries.amount})::bigint`,
      })
      .from(schema.ledgerEntries)
      .where(
        and(
          activeEntry,
          eq(schema.ledgerEntries.kind, "expense"),
          gte(schema.ledgerEntries.entryDate, referenceStart),
          lt(schema.ledgerEntries.entryDate, monthStart)
        )
      )
      .groupBy(referenceMonth, schema.ledgerEntries.categoryId),
  ]);

  const usageByCategory = new Map(usageRows.map((row) => [row.categoryId, row.value]));
  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    kind: toEntryKind(category.kind),
    emoji: category.emoji,
    icon: category.icon as LedgerCategoryIconKey,
    color: category.color as LedgerCategoryColorKey,
    sortOrder: category.sortOrder,
    entryCount: usageByCategory.get(category.id) ?? 0,
  }));

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const entries = entryRows
    .map((entry) => toLedgerEntryView(entry, categoryById))
    .sort(compareLedgerEntries);

  let income = 0;
  let expense = 0;
  const categoryTotals = new Map<number | null, number>();
  const calendarTotals = new Map<string, { expense: number; income: number }>();

  for (const entry of entries) {
    const day = calendarTotals.get(entry.entryDate) ?? { expense: 0, income: 0 };

    if (entry.kind === "income") {
      income += entry.amount;
      day.income += entry.amount;
    } else {
      expense += entry.amount;
      day.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );
    }

    calendarTotals.set(entry.entryDate, day);
  }

  const totalBudget = monthRows[0]?.totalBudget ?? null;

  const referenceMonths = new Set(referenceRows.map((row) => row.month)).size;
  const referenceByCategory = new Map<number | null, number>();
  for (const row of referenceRows) {
    referenceByCategory.set(
      row.categoryId,
      (referenceByCategory.get(row.categoryId) ?? 0) + Number(row.amount)
    );
  }
  const expenseReference = {
    months: referenceMonths,
    average: referenceMonths
      ? Math.round(
          [...referenceByCategory.values()].reduce((sum, value) => sum + value, 0) /
            referenceMonths
        )
      : null,
    byCategory: [...referenceByCategory.entries()].map(([categoryId, amount]) => ({
      categoryId,
      average: Math.round(amount / referenceMonths),
    })),
  };

  const byCategory = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryId == null ? null : categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "분류 없음",
        emoji: category?.emoji ?? "🧾",
        icon: category?.icon ?? DEFAULT_CATEGORY_ICON,
        color: category?.color ?? DEFAULT_CATEGORY_COLOR,
        amount,
        pct: expense === 0 ? 0 : Math.round((amount / expense) * 100),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const calendar = [...calendarTotals.entries()]
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    month: validMonth,
    prevMonth: dayjs(`${validMonth}-01`).subtract(1, "month").format("YYYY-MM"),
    nextMonth: dayjs(`${validMonth}-01`).add(1, "month").format("YYYY-MM"),
    account,
    categories,
    entries,
    expenseReference,
    budget: {
      totalBudget,
      note: monthRows[0]?.note ?? "",
      byCategory: budgetRows.map((row) => ({
        categoryId: row.categoryId,
        amount: row.amount,
      })),
    },
    summary: {
      income,
      expense,
      balance: income - expense,
      budgetRemaining: totalBudget == null ? null : totalBudget - expense,
      budgetUsedPct:
        totalBudget == null || totalBudget === 0
          ? null
          : Math.round((expense / totalBudget) * 100),
    },
    byCategory,
    calendar,
  };
};

const normalizeEntryFields = (input: LedgerEntryInput) => ({
  entryDate: normalizeDate(input.entryDate),
  entryTime: normalizeTime(input.entryTime),
  kind: normalizeEntryKind(input.kind),
  amount: normalizeAmount(input.amount),
  categoryId: normalizeOptionalId(input.categoryId, "분류"),
  memo: normalizeMemo(input.memo),
  tags: normalizeTags(input.tags),
});

const assertCategoryKind = async (categoryId: number | null, kind: LedgerEntryKind) => {
  if (categoryId == null) return;
  const [category] = await getDb()
    .select({ kind: schema.ledgerCategories.kind })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId))
    .limit(1);
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
  if (toEntryKind(category.kind) !== kind) {
    throw new LedgerError("분류의 입금/지출 구분이 맞지 않아요.");
  }
};

/** 새 기록을 모임통장에 묶기 위한 자산 id. 없으면 만든다. */
const ensureJointAssetId = async (): Promise<number> => {
  const db = getDb();
  await db
    .insert(schema.ledgerAssets)
    .values({ name: JOINT_ASSET_NAME, kind: "bank" })
    .onConflictDoNothing();
  const [asset] = await db
    .select({ id: schema.ledgerAssets.id })
    .from(schema.ledgerAssets)
    .where(eq(schema.ledgerAssets.name, JOINT_ASSET_NAME))
    .limit(1);
  if (!asset) throw new Error("모임 통장 자산을 만들지 못했습니다.");
  return asset.id;
};

export const createLedgerEntry = async (
  input: LedgerEntryInput,
  source: LedgerEntrySource = "web"
) => {
  const values = normalizeEntryFields(input);
  await assertCategoryKind(values.categoryId, values.kind);
  const assetId = await ensureJointAssetId();
  const [entry] = await getDb()
    .insert(schema.ledgerEntries)
    .values({ ...values, assetId, member: "joint" })
    .returning();
  await logEntryHistory(entry.id, "create", source, null, entry);
  return entry;
};

/**
 * 여러 건을 한 번에 등록한다. 같은 날짜·금액·구분·내용의 기록은 이미 있다고 보고 건너뛴다.
 * 시각이 양쪽 모두 있고 서로 다르면 다른 기록으로 본다.
 */
export const createLedgerEntriesBulk = async (
  inputs: LedgerBulkEntryInput[],
  options: { source: LedgerEntrySource; allowDuplicates?: boolean }
) => {
  if (!Array.isArray(inputs) || !inputs.length) {
    throw new LedgerError("등록할 내역이 없어요.");
  }
  if (inputs.length > MAX_BULK_ENTRIES) {
    throw new LedgerError(`한 번에 ${MAX_BULK_ENTRIES}건까지 등록할 수 있어요.`);
  }

  await ensureLedgerDefaults();
  const db = getDb();
  const categories = await getCategoryRows();
  const categoryIdByKey = new Map(
    categories.map((category) => [`${category.kind}:${category.name}`, category.id])
  );

  const normalized = inputs.map((input) => {
    if (typeof input !== "object" || input === null) {
      throw new LedgerError("내역 형식을 확인해 주세요.");
    }
    const fields = normalizeEntryFields(input);
    const named =
      typeof input.categoryName === "string"
        ? categoryIdByKey.get(`${fields.kind}:${input.categoryName.trim()}`)
        : undefined;
    const suggestedName = suggestLedgerCategoryName(fields.memo, fields.kind);
    const suggested = suggestedName
      ? categoryIdByKey.get(`${fields.kind}:${suggestedName}`)
      : undefined;
    return { ...fields, categoryId: fields.categoryId ?? named ?? suggested ?? null };
  });

  for (const fields of normalized) {
    if (
      fields.categoryId != null &&
      !categories.some(
        (category) =>
          category.id === fields.categoryId && toEntryKind(category.kind) === fields.kind
      )
    ) {
      throw new LedgerError("분류의 입금/지출 구분이 맞지 않아요.");
    }
  }

  const existing = await db
    .select()
    .from(schema.ledgerEntries)
    .where(
      and(
        activeEntry,
        inArray(schema.ledgerEntries.entryDate, [
          ...new Set(normalized.map((fields) => fields.entryDate)),
        ])
      )
    );
  const seen = existing.map((entry) => {
    const extras = readEntryExtras(entry.entryTime, entry.tags);
    return { ...entry, entryTime: extras.entryTime };
  });

  type Candidate = (typeof normalized)[number];
  const isDuplicate = (fields: Candidate) =>
    seen.some(
      (row) =>
        row.entryDate === fields.entryDate &&
        row.amount === fields.amount &&
        row.kind === fields.kind &&
        row.memo === fields.memo &&
        (row.entryTime == null ||
          fields.entryTime == null ||
          row.entryTime === fields.entryTime)
    );

  const toInsert: Candidate[] = [];
  let skipped = 0;
  for (const fields of normalized) {
    if (!options.allowDuplicates && isDuplicate(fields)) {
      skipped += 1;
      continue;
    }
    toInsert.push(fields);
    seen.push({ ...(fields as unknown as EntryRow) });
  }

  if (!toInsert.length) return { created: [] as EntryRow[], skipped };

  const assetId = await ensureJointAssetId();
  const created = await db
    .insert(schema.ledgerEntries)
    .values(toInsert.map((fields) => ({ ...fields, assetId, member: "joint" })))
    .returning();
  await Promise.all(
    created.map((entry) =>
      logEntryHistory(entry.id, "create", options.source, null, entry)
    )
  );
  return { created, skipped };
};

const findActiveEntry = async (entryId: number): Promise<EntryRow> => {
  const [entry] = await getDb()
    .select()
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .limit(1);
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  return entry;
};

export const updateLedgerEntry = async (
  id: number,
  input: LedgerEntryInput,
  source: LedgerEntrySource = "web"
) => {
  const entryId = normalizeId(id, "기록");
  const values = normalizeEntryFields(input);
  await assertCategoryKind(values.categoryId, values.kind);
  const before = await findActiveEntry(entryId);
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .returning();
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "update", source, before, entry);
  return entry;
};

/** 복구할 수 있게 표시만 지운다. */
export const deleteLedgerEntry = async (
  id: number,
  source: LedgerEntrySource = "web"
): Promise<void> => {
  const entryId = normalizeId(id, "기록");
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.ledgerEntries.id, entryId), activeEntry))
    .returning();
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "delete", source, entry, null);
};

export const restoreLedgerEntry = async (id: number) => {
  const entryId = normalizeId(id, "기록");
  const [entry] = await getDb()
    .update(schema.ledgerEntries)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.ledgerEntries.id, entryId),
        sql`${schema.ledgerEntries.deletedAt} is not null`
      )
    )
    .returning();
  if (!entry) throw new LedgerError("되돌릴 기록을 찾을 수 없어요.");
  await logEntryHistory(entryId, "restore", "web", null, entry);
  return entry;
};

const getCategoryMap = async () =>
  new Map((await getCategoryRows()).map((category) => [category.id, category]));

/** 삭제되지 않은 모든 기록. CSV 내보내기용. */
export const listAllLedgerEntries = async (): Promise<LedgerEntryView[]> => {
  const [rows, categoryById] = await Promise.all([
    getDb().select().from(schema.ledgerEntries).where(activeEntry),
    getCategoryMap(),
  ]);
  return rows
    .map((row) => toLedgerEntryView(row, categoryById))
    .sort(compareLedgerEntries);
};

/** 내용·태그·분류 이름으로 전 기간을 검색한다. */
export const searchLedgerEntries = async (query: string, limit = 200) => {
  const q = query.trim();
  if (!q) return { entries: [] as LedgerEntryView[], income: 0, expense: 0, count: 0 };

  const [rows, categoryById] = await Promise.all([
    getDb().select().from(schema.ledgerEntries).where(activeEntry),
    getCategoryMap(),
  ]);
  const lowered = q.toLowerCase();

  // 화면에 보이는 값으로 찾는다. 숨긴 예전 태그(모임통장, 시각)는 찾지 않는다.
  const views = rows
    .map((row) => toLedgerEntryView(row, categoryById))
    .filter((entry) =>
      [entry.memo, entry.tags, entry.categoryName ?? ""].some((value) =>
        value.toLowerCase().includes(lowered)
      )
    )
    .sort(compareLedgerEntries);

  return {
    entries: views.slice(0, limit),
    income: views
      .filter((e) => e.kind === "income")
      .reduce((sum, e) => sum + e.amount, 0),
    expense: views
      .filter((e) => e.kind === "expense")
      .reduce((sum, e) => sum + e.amount, 0),
    count: views.length,
  };
};

export const listLedgerHistory = async (limit = 50): Promise<LedgerHistoryItem[]> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.ledgerEntryHistory)
    .orderBy(
      desc(schema.ledgerEntryHistory.createdAt),
      desc(schema.ledgerEntryHistory.id)
    )
    .limit(limit);

  const deleted = rows.length
    ? await db
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(
          and(
            inArray(schema.ledgerEntries.id, [
              ...new Set(rows.map((row) => row.entryId)),
            ]),
            sql`${schema.ledgerEntries.deletedAt} is not null`
          )
        )
    : [];
  const deletedIds = new Set(deleted.map((row) => row.id));
  const seenDelete = new Set<number>();

  return rows.map((row) => {
    const snapshot = (row.after ?? row.before ?? {}) as Partial<EntryRow>;
    const latestDelete = row.action === "delete" && !seenDelete.has(row.entryId);
    if (row.action === "delete") seenDelete.add(row.entryId);
    return {
      id: row.id,
      entryId: row.entryId,
      action: row.action as LedgerHistoryItem["action"],
      source: row.source === "agent" ? "agent" : "web",
      createdAt: row.createdAt.toISOString(),
      entryDate: snapshot.entryDate ?? "",
      kind: toEntryKind(snapshot.kind ?? "expense"),
      amount: snapshot.amount ?? 0,
      memo: snapshot.memo ?? "",
      canRestore: latestDelete && deletedIds.has(row.entryId),
    };
  });
};

export const saveLedgerBudget = async (input: LedgerBudgetInput): Promise<void> => {
  const month = normalizeMonth(input.month);
  const totalBudget = normalizeTotalBudget(input.totalBudget);
  const note = normalizeNote(input.note);

  const budgetByCategory = new Map<number, number>();
  if (input.categories !== undefined && !Array.isArray(input.categories)) {
    throw new LedgerError("분류별 예산을 확인해 주세요.");
  }
  for (const row of input.categories ?? []) {
    if (typeof row !== "object" || row === null) {
      throw new LedgerError("분류별 예산을 확인해 주세요.");
    }
    const categoryId = normalizeId(row.categoryId, "분류");
    const amount = normalizeTotalBudget(row.amount);
    if (amount == null) continue;
    budgetByCategory.set(categoryId, amount);
  }

  if (budgetByCategory.size) {
    const ids = [...budgetByCategory.keys()];
    const existing = await getDb()
      .select({ id: schema.ledgerCategories.id })
      .from(schema.ledgerCategories)
      .where(inArray(schema.ledgerCategories.id, ids));
    if (existing.length !== ids.length) {
      throw new LedgerError("분류를 찾을 수 없어요.");
    }
  }

  const rows = JSON.stringify(
    [...budgetByCategory.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([category_id, amount]) => ({ category_id, amount }))
  );

  // 드라이버와 상관없이 원자적으로 저장되도록 한 문장으로 처리한다.
  await executeStatement(sql`
    with new_rows as (
      select category_id, amount
      from jsonb_to_recordset(${rows}::jsonb) as r(category_id int, amount int)
    ),
    saved_month as (
      insert into ledger_months (month, total_budget, note, updated_at)
      values (${month}, ${totalBudget}, ${note}, now())
      on conflict (month) do update
        set total_budget = excluded.total_budget,
            note = excluded.note,
            updated_at = now()
    ),
    removed as (
      delete from ledger_budgets
      where month = ${month}
        and category_id not in (select category_id from new_rows)
    )
    insert into ledger_budgets (month, category_id, amount)
    select ${month}, category_id, amount from new_rows
    on conflict (month, category_id) do update set amount = excluded.amount
  `);
};

export const createLedgerCategory = async (input: LedgerCategoryInput) => {
  const name = normalizeName(input.name, "분류");
  const kind = normalizeEntryKind(input.kind);
  const emoji = normalizeEmoji(input.emoji);
  const icon =
    input.icon === undefined
      ? suggestCategoryIcon(name)
      : normalizeCategoryIcon(input.icon);
  const color =
    input.color === undefined
      ? defaultCategoryColor(icon)
      : normalizeCategoryColor(input.color);
  const db = getDb();

  const [maxRow] = await db
    .select({
      value: sql<number>`coalesce(max(${schema.ledgerCategories.sortOrder}), -1)`,
    })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.kind, kind));

  const [category] = await db
    .insert(schema.ledgerCategories)
    .values({
      name,
      kind,
      emoji,
      icon,
      color,
      sortOrder: Number(maxRow?.value ?? -1) + 1,
    })
    .returning();
  return category;
};

export const updateLedgerCategory = async (input: LedgerCategoryUpdate) => {
  const id = normalizeId(input.id, "분류");
  const patch: {
    name?: string;
    emoji?: string;
    icon?: LedgerCategoryIconKey;
    color?: LedgerCategoryColorKey;
  } = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name, "분류");
  if (input.emoji !== undefined) patch.emoji = normalizeEmoji(input.emoji);
  if (input.icon !== undefined) patch.icon = normalizeCategoryIcon(input.icon);
  if (input.color !== undefined) patch.color = normalizeCategoryColor(input.color);
  if (!Object.keys(patch).length) throw new LedgerError("변경할 내용이 없어요.");

  const db = getDb();
  const [category] = await db
    .update(schema.ledgerCategories)
    .set(patch)
    .where(eq(schema.ledgerCategories.id, id))
    .returning();
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
  return category;
};

/**
 * 분류를 지운다. 쓰인 분류라면 내역이 "분류 없음"이 되지 않도록 옮길 분류가 필요하다.
 * 옮기기와 삭제는 한 SQL 문장으로 함께 처리한다.
 */
export const deleteLedgerCategory = async (
  id: number,
  moveToIdInput?: unknown
): Promise<void> => {
  const categoryId = normalizeId(id, "분류");
  const moveToId = normalizeOptionalId(moveToIdInput, "옮길 분류");
  const db = getDb();

  const [category] = await db
    .select({ kind: schema.ledgerCategories.kind })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId))
    .limit(1);
  if (!category) throw new LedgerError("분류를 찾을 수 없어요.");

  const [[siblings], [usage]] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.ledgerCategories)
      .where(eq(schema.ledgerCategories.kind, category.kind)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.categoryId, categoryId)),
  ]);
  if ((siblings?.value ?? 0) <= 1) throw new LedgerError("분류는 최소 하나 필요해요.");

  if (!usage?.value) {
    await db
      .delete(schema.ledgerCategories)
      .where(eq(schema.ledgerCategories.id, categoryId));
    return;
  }

  if (moveToId == null) throw new LedgerError("내역을 옮길 분류를 선택해 주세요.");
  if (moveToId === categoryId) throw new LedgerError("다른 분류를 선택해 주세요.");
  await assertCategoryKind(moveToId, toEntryKind(category.kind));

  await executeStatement(sql`
    with moved as (
      update ledger_entries set category_id = ${moveToId} where category_id = ${categoryId}
    )
    delete from ledger_categories where id = ${categoryId}
  `);
};
