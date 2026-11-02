import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { dayjs } from "@/lib/kst";
import type { LedgerMember } from "@/lib/ledger/members";

export type LedgerEntryKind = "expense" | "income";
export type LedgerAssetKind = "cash" | "bank" | "card";

export type LedgerMonthPayload = {
  month: string;
  prevMonth: string;
  nextMonth: string;
  categories: {
    id: number;
    name: string;
    kind: LedgerEntryKind;
    emoji: string;
    sortOrder: number;
  }[];
  assets: { id: number; name: string; kind: LedgerAssetKind; sortOrder: number }[];
  entries: {
    id: number;
    entryDate: string;
    kind: LedgerEntryKind;
    amount: number;
    categoryId: number | null;
    categoryName: string | null;
    categoryEmoji: string | null;
    assetId: number | null;
    assetName: string | null;
    memo: string;
    tags: string;
    member: LedgerMember;
  }[];
  budget: {
    totalBudget: number | null;
    note: string;
    byCategory: { categoryId: number; amount: number }[];
  };
  summary: {
    income: number;
    expense: number;
    balance: number;
    byMember: { wonchan: number; yeeun: number };
    settlement: {
      from: LedgerMember | null;
      to: LedgerMember | null;
      amount: number;
    };
    budgetRemaining: number | null;
    budgetUsedPct: number | null;
  };
  byCategory: {
    categoryId: number | null;
    name: string;
    emoji: string;
    amount: number;
    pct: number;
  }[];
  byAsset: { assetId: number | null; name: string; amount: number }[];
  calendar: { date: string; expense: number; income: number }[];
};

export interface LedgerEntryInput {
  entryDate: string;
  kind: LedgerEntryKind;
  amount: number;
  categoryId?: number | null;
  assetId?: number | null;
  memo?: string;
  tags?: string;
  member: LedgerMember;
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
}

export interface LedgerCategoryUpdate {
  id: number;
  name?: string;
  emoji?: string;
}

export interface LedgerAssetInput {
  name: string;
  kind: LedgerAssetKind;
}

export interface LedgerAssetUpdate {
  id: number;
  name?: string;
  kind?: LedgerAssetKind;
}

/** API 밖으로 나가면 400으로 변환되는 검증 오류. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

const MAX_AMOUNT = 1_000_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const DEFAULT_EXPENSE_CATEGORIES = [
  ["식비", "🍚"],
  ["카페", "☕"],
  ["교통", "🚌"],
  ["생활", "🛒"],
  ["쇼핑", "🛍️"],
  ["문화", "🎬"],
  ["의료", "💊"],
  ["주거", "🏠"],
  ["기타", "🧾"],
] as const;

const DEFAULT_INCOME_CATEGORIES = [
  ["급여", "💰"],
  ["용돈", "🎁"],
  ["이자", "🏦"],
  ["기타", "➕"],
] as const;

const DEFAULT_ASSETS: { name: string; kind: LedgerAssetKind }[] = [
  { name: "현금", kind: "cash" },
  { name: "체크카드", kind: "card" },
  { name: "신용카드", kind: "card" },
  { name: "계좌", kind: "bank" },
];

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
    throw new LedgerError("수입/지출 구분을 확인해 주세요.");
  }
  return value;
};

const normalizeAssetKind = (value: unknown): LedgerAssetKind => {
  if (value !== "cash" && value !== "bank" && value !== "card") {
    throw new LedgerError("자산 종류를 확인해 주세요.");
  }
  return value;
};

const normalizeMember = (value: unknown): LedgerMember => {
  if (value !== "wonchan" && value !== "yeeun") {
    throw new LedgerError("기록자를 확인해 주세요.");
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

const normalizeMonth = (value: unknown): string => {
  if (typeof value !== "string" || !MONTH_RE.test(value)) {
    throw new LedgerError("월 형식이 올바르지 않아요.");
  }
  return value;
};

const normalizeDate = (value: unknown): string => {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new LedgerError("날짜 형식이 올바르지 않아요.");
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

const toAssetKind = (kind: string): LedgerAssetKind =>
  kind === "cash" ? "cash" : kind === "bank" ? "bank" : "card";

const toMember = (member: string): LedgerMember =>
  member === "yeeun" ? "yeeun" : "wonchan";

/**
 * 분류/자산 테이블이 비어 있을 때만 기본값을 넣는다.
 * 여러 요청이 동시에 들어와도 unique 인덱스 덕분에 안전하다.
 */
export const ensureLedgerDefaults = async (): Promise<void> => {
  const db = getDb();

  const [categoryCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.ledgerCategories);

  if (!categoryCount?.value) {
    await db
      .insert(schema.ledgerCategories)
      .values([
        ...DEFAULT_EXPENSE_CATEGORIES.map(([name, emoji], index) => ({
          name,
          emoji,
          kind: "expense",
          sortOrder: index,
        })),
        ...DEFAULT_INCOME_CATEGORIES.map(([name, emoji], index) => ({
          name,
          emoji,
          kind: "income",
          sortOrder: index,
        })),
      ])
      .onConflictDoNothing();
  }

  const [assetCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.ledgerAssets);

  if (!assetCount?.value) {
    await db
      .insert(schema.ledgerAssets)
      .values(DEFAULT_ASSETS.map((asset, index) => ({ ...asset, sortOrder: index })))
      .onConflictDoNothing();
  }
};

export const getLedgerMonth = async (month: string): Promise<LedgerMonthPayload> => {
  const validMonth = normalizeMonth(month);
  await ensureLedgerDefaults();

  const db = getDb();
  const monthStart = `${validMonth}-01`;
  const monthEnd = `${validMonth}-31`;

  const [categoryRows, assetRows, entryRows, monthRows, budgetRows] = await Promise.all([
    db
      .select()
      .from(schema.ledgerCategories)
      .orderBy(asc(schema.ledgerCategories.sortOrder), asc(schema.ledgerCategories.id)),
    db
      .select()
      .from(schema.ledgerAssets)
      .orderBy(asc(schema.ledgerAssets.sortOrder), asc(schema.ledgerAssets.id)),
    db
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
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
  ]);

  const categories = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    kind: toEntryKind(category.kind),
    emoji: category.emoji,
    sortOrder: category.sortOrder,
  }));
  const assets = assetRows.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: toAssetKind(asset.kind),
    sortOrder: asset.sortOrder,
  }));

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const entries = entryRows.map((entry) => {
    const category = entry.categoryId == null ? null : categoryById.get(entry.categoryId);
    const asset = entry.assetId == null ? null : assetById.get(entry.assetId);
    return {
      id: entry.id,
      entryDate: entry.entryDate,
      kind: toEntryKind(entry.kind),
      amount: entry.amount,
      categoryId: entry.categoryId,
      categoryName: category?.name ?? null,
      categoryEmoji: category?.emoji ?? null,
      assetId: entry.assetId,
      assetName: asset?.name ?? null,
      memo: entry.memo,
      tags: entry.tags,
      member: toMember(entry.member),
    };
  });

  let income = 0;
  let expense = 0;
  const byMember = { wonchan: 0, yeeun: 0 };
  const categoryTotals = new Map<number | null, number>();
  const assetTotals = new Map<number | null, number>();
  const calendarTotals = new Map<string, { expense: number; income: number }>();

  for (const entry of entries) {
    const day = calendarTotals.get(entry.entryDate) ?? { expense: 0, income: 0 };

    if (entry.kind === "income") {
      income += entry.amount;
      day.income += entry.amount;
    } else {
      expense += entry.amount;
      byMember[entry.member] += entry.amount;
      day.expense += entry.amount;
      categoryTotals.set(
        entry.categoryId,
        (categoryTotals.get(entry.categoryId) ?? 0) + entry.amount
      );
      assetTotals.set(
        entry.assetId,
        (assetTotals.get(entry.assetId) ?? 0) + entry.amount
      );
    }

    calendarTotals.set(entry.entryDate, day);
  }

  const diff = Math.abs(byMember.wonchan - byMember.yeeun);
  const settlement =
    diff < 2
      ? { from: null, to: null, amount: 0 }
      : {
          from: byMember.wonchan > byMember.yeeun ? "yeeun" : "wonchan",
          to: byMember.wonchan > byMember.yeeun ? "wonchan" : "yeeun",
          amount: Math.round(diff / 2),
        };

  const totalBudget = monthRows[0]?.totalBudget ?? null;

  const byCategory = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryId == null ? null : categoryById.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "분류 없음",
        emoji: category?.emoji ?? "🧾",
        amount,
        pct: expense === 0 ? 0 : Math.round((amount / expense) * 100),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const byAsset = [...assetTotals.entries()]
    .map(([assetId, amount]) => {
      const asset = assetId == null ? null : assetById.get(assetId);
      return { assetId, name: asset?.name ?? "결제수단 없음", amount };
    })
    .sort((a, b) => b.amount - a.amount);

  const calendar = [...calendarTotals.entries()]
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    month: validMonth,
    prevMonth: dayjs(`${validMonth}-01`).subtract(1, "month").format("YYYY-MM"),
    nextMonth: dayjs(`${validMonth}-01`).add(1, "month").format("YYYY-MM"),
    categories,
    assets,
    entries,
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
      byMember,
      settlement: {
        from: settlement.from as LedgerMember | null,
        to: settlement.to as LedgerMember | null,
        amount: settlement.amount,
      },
      budgetRemaining: totalBudget == null ? null : totalBudget - expense,
      budgetUsedPct:
        totalBudget == null || totalBudget === 0
          ? null
          : Math.round((expense / totalBudget) * 100),
    },
    byCategory,
    byAsset,
    calendar,
  };
};

const validateEntryInput = async (input: LedgerEntryInput) => {
  const entryDate = normalizeDate(input.entryDate);
  const kind = normalizeEntryKind(input.kind);
  const amount = normalizeAmount(input.amount);
  const member = normalizeMember(input.member);
  const categoryId = normalizeOptionalId(input.categoryId, "분류");
  const assetId = normalizeOptionalId(input.assetId, "결제수단");
  const memo = normalizeMemo(input.memo);
  const tags = normalizeTags(input.tags);

  const db = getDb();

  if (categoryId != null) {
    const [category] = await db
      .select({ kind: schema.ledgerCategories.kind })
      .from(schema.ledgerCategories)
      .where(eq(schema.ledgerCategories.id, categoryId))
      .limit(1);
    if (!category) throw new LedgerError("분류를 찾을 수 없어요.");
    if (toEntryKind(category.kind) !== kind) {
      throw new LedgerError("분류의 수입/지출 구분이 맞지 않아요.");
    }
  }

  if (assetId != null) {
    const [asset] = await db
      .select({ id: schema.ledgerAssets.id })
      .from(schema.ledgerAssets)
      .where(eq(schema.ledgerAssets.id, assetId))
      .limit(1);
    if (!asset) throw new LedgerError("결제수단을 찾을 수 없어요.");
  }

  return { entryDate, kind, amount, categoryId, assetId, memo, tags, member };
};

export const createLedgerEntry = async (input: LedgerEntryInput) => {
  const values = await validateEntryInput(input);
  const db = getDb();
  const [entry] = await db.insert(schema.ledgerEntries).values(values).returning();
  return entry;
};

export const updateLedgerEntry = async (id: number, input: LedgerEntryInput) => {
  const entryId = normalizeId(id, "기록");
  const values = await validateEntryInput(input);
  const db = getDb();
  const [entry] = await db
    .update(schema.ledgerEntries)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.ledgerEntries.id, entryId))
    .returning();
  if (!entry) throw new LedgerError("기록을 찾을 수 없어요.");
  return entry;
};

export const deleteLedgerEntry = async (id: number): Promise<void> => {
  const entryId = normalizeId(id, "기록");
  const db = getDb();
  await db.delete(schema.ledgerEntries).where(eq(schema.ledgerEntries.id, entryId));
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

  const db = getDb();

  if (budgetByCategory.size) {
    const ids = [...budgetByCategory.keys()];
    const existing = await db
      .select({ id: schema.ledgerCategories.id })
      .from(schema.ledgerCategories)
      .where(inArray(schema.ledgerCategories.id, ids));
    if (existing.length !== ids.length) {
      throw new LedgerError("분류를 찾을 수 없어요.");
    }
  }

  await db
    .insert(schema.ledgerMonths)
    .values({ month, totalBudget, note })
    .onConflictDoUpdate({
      target: schema.ledgerMonths.month,
      set: { totalBudget, note, updatedAt: new Date() },
    });

  await db.delete(schema.ledgerBudgets).where(eq(schema.ledgerBudgets.month, month));

  const rows = [...budgetByCategory.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => ({ month, categoryId, amount }));

  if (rows.length) {
    await db.insert(schema.ledgerBudgets).values(rows);
  }
};

export const createLedgerCategory = async (input: LedgerCategoryInput) => {
  const name = normalizeName(input.name, "분류");
  const kind = normalizeEntryKind(input.kind);
  const emoji = normalizeEmoji(input.emoji);
  const db = getDb();

  const [maxRow] = await db
    .select({
      value: sql<number>`coalesce(max(${schema.ledgerCategories.sortOrder}), -1)`,
    })
    .from(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.kind, kind));

  const [category] = await db
    .insert(schema.ledgerCategories)
    .values({ name, kind, emoji, sortOrder: Number(maxRow?.value ?? -1) + 1 })
    .returning();
  return category;
};

export const updateLedgerCategory = async (input: LedgerCategoryUpdate) => {
  const id = normalizeId(input.id, "분류");
  const patch: { name?: string; emoji?: string } = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name, "분류");
  if (input.emoji !== undefined) patch.emoji = normalizeEmoji(input.emoji);
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

export const deleteLedgerCategory = async (id: number): Promise<void> => {
  const categoryId = normalizeId(id, "분류");
  const db = getDb();
  await db
    .delete(schema.ledgerCategories)
    .where(eq(schema.ledgerCategories.id, categoryId));
};

export const createLedgerAsset = async (input: LedgerAssetInput) => {
  const name = normalizeName(input.name, "자산");
  const kind = normalizeAssetKind(input.kind);
  const db = getDb();

  const [maxRow] = await db
    .select({ value: sql<number>`coalesce(max(${schema.ledgerAssets.sortOrder}), -1)` })
    .from(schema.ledgerAssets);

  const [asset] = await db
    .insert(schema.ledgerAssets)
    .values({ name, kind, sortOrder: Number(maxRow?.value ?? -1) + 1 })
    .returning();
  return asset;
};

export const updateLedgerAsset = async (input: LedgerAssetUpdate) => {
  const id = normalizeId(input.id, "자산");
  const patch: { name?: string; kind?: LedgerAssetKind } = {};

  if (input.name !== undefined) patch.name = normalizeName(input.name, "자산");
  if (input.kind !== undefined) patch.kind = normalizeAssetKind(input.kind);
  if (!Object.keys(patch).length) throw new LedgerError("변경할 내용이 없어요.");

  const db = getDb();
  const [asset] = await db
    .update(schema.ledgerAssets)
    .set(patch)
    .where(eq(schema.ledgerAssets.id, id))
    .returning();
  if (!asset) throw new LedgerError("자산을 찾을 수 없어요.");
  return asset;
};

export const deleteLedgerAsset = async (id: number): Promise<void> => {
  const assetId = normalizeId(id, "자산");
  const db = getDb();
  await db.delete(schema.ledgerAssets).where(eq(schema.ledgerAssets.id, assetId));
};
