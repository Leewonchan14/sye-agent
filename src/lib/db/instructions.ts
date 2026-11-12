import { and, desc, eq } from "drizzle-orm";
import { omit } from "lodash";

import { getDb, schema } from "@/lib/db/db";

const { instructions: instructionsTable } = schema;

export interface Instructions {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: Date | null;
}

/** 응답에 소유자 id는 싣지 않는다. */
const omitUser = <T extends { userId: string }>(row: T): Omit<T, "userId"> =>
  omit(row, "userId");

const columns = {
  id: instructionsTable.id,
  label: instructionsTable.label,
  content: instructionsTable.content,
  isActive: instructionsTable.isActive,
  createdAt: instructionsTable.createdAt,
};

const ownedBy = (userId: string, id: number) =>
  and(eq(instructionsTable.id, id), eq(instructionsTable.userId, userId));

/** 사용자의 활성화된 지시 사항을 반환합니다. */
export const getActiveInstructions = async (userId: string): Promise<Instructions[]> =>
  getDb()
    .select(columns)
    .from(instructionsTable)
    .where(
      and(eq(instructionsTable.userId, userId), eq(instructionsTable.isActive, true))
    )
    .orderBy(desc(instructionsTable.createdAt));

/** 사용자의 지시 사항을 최신순으로 반환합니다. */
export const listInstructions = async (userId: string): Promise<Instructions[]> =>
  getDb()
    .select(columns)
    .from(instructionsTable)
    .where(eq(instructionsTable.userId, userId))
    .orderBy(desc(instructionsTable.createdAt));

/**
 * 지시 사항을 저장합니다. id가 있으면 수정, 없으면 새로 생성합니다.
 * isActive는 수정 시 유지됩니다.
 */
export const saveInstructions = async (
  userId: string,
  label: string,
  content: string,
  id?: number
): Promise<Instructions> => {
  const db = getDb();

  if (id) {
    const rows = await db
      .update(instructionsTable)
      .set({ label, content })
      .where(ownedBy(userId, id))
      .returning();
    if (!rows[0]) throw new Error("지시 사항을 찾을 수 없습니다.");
    return omitUser(rows[0]);
  }

  const rows = await db
    .insert(instructionsTable)
    .values({ userId, label, content, isActive: true })
    .returning();

  return omitUser(rows[0]);
};

/** 지시 사항의 활성 상태를 토글합니다. */
export const toggleInstructionsActive = async (
  userId: string,
  id: number
): Promise<Instructions> => {
  const db = getDb();
  const [current] = await db
    .select(columns)
    .from(instructionsTable)
    .where(ownedBy(userId, id))
    .limit(1);
  if (!current) throw new Error("지시 사항을 찾을 수 없습니다.");

  const [updated] = await db
    .update(instructionsTable)
    .set({ isActive: !current.isActive })
    .where(ownedBy(userId, id))
    .returning();
  return omitUser(updated);
};

/** 지시 사항을 삭제합니다. */
export const deleteInstructions = async (userId: string, id: number): Promise<void> => {
  const db = getDb();
  await db.delete(instructionsTable).where(ownedBy(userId, id));
};
