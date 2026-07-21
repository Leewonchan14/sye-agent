import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { instructions: instructionsTable } = schema;

export interface Instructions {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: Date | null;
}

/** 모든 활성화된 지시 사항을 반환합니다. */
export const getActiveInstructions = async (): Promise<Instructions[]> => {
  const db = getDb();
  return db
    .select()
    .from(instructionsTable)
    .where(eq(instructionsTable.isActive, true))
    .orderBy(desc(instructionsTable.createdAt));
};

/** 모든 지시 사항을 최신순으로 반환합니다. */
export const listInstructions = async (): Promise<Instructions[]> => {
  const db = getDb();
  return db.select().from(instructionsTable).orderBy(desc(instructionsTable.createdAt));
};

/**
 * 지시 사항을 저장합니다. id가 있으면 수정, 없으면 새로 생성합니다.
 * isActive는 수정 시 유지됩니다.
 */
export const saveInstructions = async (
  label: string,
  content: string,
  id?: number
): Promise<Instructions> => {
  const db = getDb();

  if (id) {
    const rows = await db
      .update(instructionsTable)
      .set({ label, content })
      .where(eq(instructionsTable.id, id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(instructionsTable)
    .values({ label, content, isActive: true })
    .returning();

  return rows[0];
};

/** 지시 사항의 활성 상태를 토글합니다. */
export const toggleInstructionsActive = async (id: number): Promise<Instructions> => {
  const db = getDb();
  const [current] = await db
    .select()
    .from(instructionsTable)
    .where(eq(instructionsTable.id, id))
    .limit(1);
  if (!current) throw new Error("지시 사항을 찾을 수 없습니다.");

  const [updated] = await db
    .update(instructionsTable)
    .set({ isActive: !current.isActive })
    .where(eq(instructionsTable.id, id))
    .returning();
  return updated;
};

/** 지시 사항을 삭제합니다. */
export const deleteInstructions = async (id: number): Promise<void> => {
  const db = getDb();
  await db.delete(instructionsTable).where(eq(instructionsTable.id, id));
};
