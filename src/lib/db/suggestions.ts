import { and, asc, eq } from "drizzle-orm";
import { omit } from "lodash";

import { DEFAULT_SUGGESTIONS } from "@/lib/data/default-suggestions";
import { getDb, schema } from "@/lib/db/db";

const { suggestions: suggestionsTable } = schema;

export interface Suggestion {
  id: number;
  label: string;
  prompt: string;
  sortOrder: number | null;
  createdAt: Date | null;
}

/** 응답에 소유자 id는 싣지 않는다. */
const omitUser = <T extends { userId: string }>(row: T): Omit<T, "userId"> =>
  omit(row, "userId");

const columns = {
  id: suggestionsTable.id,
  label: suggestionsTable.label,
  prompt: suggestionsTable.prompt,
  sortOrder: suggestionsTable.sortOrder,
  createdAt: suggestionsTable.createdAt,
};

/** 사용자의 예시 질문을 정렬 순서대로 반환합니다. */
export const listSuggestions = async (userId: string): Promise<Suggestion[]> =>
  getDb()
    .select(columns)
    .from(suggestionsTable)
    .where(eq(suggestionsTable.userId, userId))
    .orderBy(asc(suggestionsTable.sortOrder), asc(suggestionsTable.id));

/** 예시 질문을 저장합니다. id가 있으면 그 사용자의 항목만 수정합니다. */
export const saveSuggestion = async (
  userId: string,
  label: string,
  prompt: string,
  id?: number,
  sortOrder?: number
): Promise<Suggestion> => {
  const db = getDb();

  if (id) {
    const rows = await db
      .update(suggestionsTable)
      .set({ label, prompt, ...(sortOrder != null ? { sortOrder } : {}) })
      .where(and(eq(suggestionsTable.id, id), eq(suggestionsTable.userId, userId)))
      .returning();
    if (!rows[0]) throw new Error("예시 질문을 찾을 수 없습니다.");
    return omitUser(rows[0]);
  }

  const rows = await db
    .insert(suggestionsTable)
    .values({ userId, label, prompt, sortOrder: sortOrder ?? undefined })
    .returning();
  return omitUser(rows[0]);
};

/** 예시 질문을 삭제합니다. */
export const deleteSuggestion = async (userId: string, id: number): Promise<void> => {
  await getDb()
    .delete(suggestionsTable)
    .where(and(eq(suggestionsTable.id, id), eq(suggestionsTable.userId, userId)));
};

/** 사용자의 예시 질문을 기본값으로 되돌립니다. */
export const resetSuggestions = async (userId: string): Promise<number> => {
  const db = getDb();
  await db.delete(suggestionsTable).where(eq(suggestionsTable.userId, userId));
  await seedDefaultSuggestions(userId);
  return DEFAULT_SUGGESTIONS.length;
};

/** 가입 직후 기본 예시 질문을 채운다. */
export const seedDefaultSuggestions = async (userId: string): Promise<void> => {
  await getDb()
    .insert(suggestionsTable)
    .values(DEFAULT_SUGGESTIONS.map((s) => ({ ...s, userId })));
};
