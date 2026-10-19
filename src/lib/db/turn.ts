import type { UIMessageChunk } from "ai";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { chatTurns, chatTurnFrames } = schema;

export type ChatTurnStatus = "running" | "completed" | "failed" | "cancelled";

export interface ChatTurn {
  sessionId: string;
  hermesRunId: string;
  status: ChatTurnStatus;
  nextOffset: number;
  hermesSeq: number;
  error: string | null;
}

export interface ChatTurnFrame {
  offset: number;
  chunk: UIMessageChunk;
}

const toChatTurn = (row: typeof chatTurns.$inferSelect): ChatTurn => ({
  sessionId: row.sessionId,
  hermesRunId: row.hermesRunId,
  status: row.status as ChatTurnStatus,
  nextOffset: row.nextOffset,
  hermesSeq: row.hermesSeq,
  error: row.error,
});

/** 새 턴을 시작한다 — 같은 세션의 이전 턴 프레임 로그는 버린다. */
export const startChatTurn = async (
  sessionId: string,
  hermesRunId: string
): Promise<void> => {
  const db = getDb();
  await db.delete(chatTurnFrames).where(eq(chatTurnFrames.sessionId, sessionId));
  await db
    .insert(chatTurns)
    .values({ sessionId, hermesRunId })
    .onConflictDoUpdate({
      target: chatTurns.sessionId,
      set: {
        hermesRunId,
        status: "running",
        nextOffset: 0,
        hermesSeq: -1,
        error: null,
        updatedAt: new Date(),
      },
    });
};

export const getChatTurn = async (sessionId: string): Promise<ChatTurn | null> => {
  const rows = await getDb()
    .select()
    .from(chatTurns)
    .where(eq(chatTurns.sessionId, sessionId))
    .limit(1);
  return rows.length > 0 ? toChatTurn(rows[0]) : null;
};

/** UI 청크를 offset 순서대로 적재한다 (재개 시 재생용). */
export const appendChatTurnFrames = async (
  sessionId: string,
  frames: ChatTurnFrame[]
): Promise<void> => {
  if (frames.length === 0) return;
  await getDb()
    .insert(chatTurnFrames)
    .values(
      frames.map((frame) => ({ sessionId, offset: frame.offset, chunk: frame.chunk }))
    )
    .onConflictDoNothing();
};

export interface ChatTurnPatch {
  status?: ChatTurnStatus;
  nextOffset?: number;
  hermesSeq?: number;
  error?: string | null;
}

export const updateChatTurn = async (
  sessionId: string,
  patch: ChatTurnPatch
): Promise<void> => {
  if (Object.keys(patch).length === 0) return;
  await getDb()
    .update(chatTurns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(chatTurns.sessionId, sessionId));
};

export const readChatTurnFrames = async (
  sessionId: string,
  fromOffset: number
): Promise<ChatTurnFrame[]> => {
  const rows = await getDb()
    .select({ offset: chatTurnFrames.offset, chunk: chatTurnFrames.chunk })
    .from(chatTurnFrames)
    .where(
      and(eq(chatTurnFrames.sessionId, sessionId), gte(chatTurnFrames.offset, fromOffset))
    )
    .orderBy(asc(chatTurnFrames.offset));
  return rows.map((row) => ({ offset: row.offset, chunk: row.chunk }));
};

/** 턴이 완전히 끝나고 브라우저도 따라잡았을 때 로그를 정리한다. */
export const clearChatTurn = async (sessionId: string): Promise<void> => {
  const db = getDb();
  await db.delete(chatTurnFrames).where(eq(chatTurnFrames.sessionId, sessionId));
  await db.delete(chatTurns).where(eq(chatTurns.sessionId, sessionId));
};

/** 오래된 턴 로그 청소(하루 지난 것) — 요청 경로에서 가끔 best-effort로 호출한다. */
export const pruneChatTurns = async (): Promise<void> => {
  const db = getDb();
  const stale = sql`${chatTurns.updatedAt} < now() - interval '1 day'`;
  await db
    .delete(chatTurnFrames)
    .where(
      inArray(
        chatTurnFrames.sessionId,
        db.select({ sessionId: chatTurns.sessionId }).from(chatTurns).where(stale)
      )
    );
  await db.delete(chatTurns).where(stale);
};
