import { asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { suggestions: suggestionsTable } = schema;

export interface Suggestion {
  id: number;
  label: string;
  prompt: string;
  sortOrder: number | null;
  createdAt: Date | null;
}

/** 모든 제안을 정렬 순서대로 반환합니다. */
export const listSuggestions = async (): Promise<Suggestion[]> => {
  const db = getDb();
  return db.select().from(suggestionsTable).orderBy(asc(suggestionsTable.sortOrder));
};

/**
 * 제안을 저장합니다. id가 있으면 수정, 없으면 새로 생성합니다.
 */
export const saveSuggestion = async (
  label: string,
  prompt: string,
  id?: number,
  sortOrder?: number
): Promise<Suggestion> => {
  const db = getDb();

  if (id) {
    const [current] = await db
      .select()
      .from(suggestionsTable)
      .where(eq(suggestionsTable.id, id))
      .limit(1);
    if (!current) throw new Error("제안을 찾을 수 없습니다.");

    const rows = await db
      .update(suggestionsTable)
      .set({ label, prompt, sortOrder: sortOrder ?? current.sortOrder })
      .where(eq(suggestionsTable.id, id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(suggestionsTable)
    .values({ label, prompt, sortOrder: sortOrder ?? undefined })
    .returning();

  return rows[0];
};

/** 제안을 삭제합니다. */
export const deleteSuggestion = async (id: number): Promise<void> => {
  const db = getDb();
  await db.delete(suggestionsTable).where(eq(suggestionsTable.id, id));
};
