import { and, asc, ne } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";
import { activeEntry, toEntryKind, type LedgerEntryKind } from "@/lib/db/ledger";
import { kst } from "@/lib/kst";

export type LedgerSuggestion = {
  memo: string;
  count: number;
  kind: LedgerEntryKind;
  amount: number;
  categoryId: number | null;
};

const MAX_SUGGESTIONS = 300;
const RECENT_DAYS = 90;
const RECENT_WEIGHT = 5;

/** 내용별로 묶어 가장 최근 값을 돌려준다. 자주, 최근에 쓴 내역이 앞에 온다. */
export const getLedgerSuggestions = async (): Promise<LedgerSuggestion[]> => {
  const rows = await getDb()
    .select({
      memo: schema.ledgerEntries.memo,
      kind: schema.ledgerEntries.kind,
      amount: schema.ledgerEntries.amount,
      categoryId: schema.ledgerEntries.categoryId,
      entryDate: schema.ledgerEntries.entryDate,
    })
    .from(schema.ledgerEntries)
    .where(and(activeEntry, ne(schema.ledgerEntries.memo, "")))
    .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.id));

  const recentFrom = kst().subtract(RECENT_DAYS, "day").format("YYYY-MM-DD");
  const groups = new Map<
    string,
    { latest: (typeof rows)[number]; count: number; score: number }
  >();

  for (const row of rows) {
    const group = groups.get(row.memo) ?? { latest: row, count: 0, score: 0 };
    group.latest = row;
    group.count += 1;
    group.score += row.entryDate >= recentFrom ? RECENT_WEIGHT : 1;
    groups.set(row.memo, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ latest, count }) => ({
      memo: latest.memo,
      count,
      kind: toEntryKind(latest.kind),
      amount: latest.amount,
      categoryId: latest.categoryId,
    }));
};
