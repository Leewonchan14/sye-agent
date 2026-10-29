import type { UIMessageChunk } from "ai";
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { chatTurns, chatTurnFrames } = schema;

export type ChatTurnStatus = "running" | "completed" | "failed" | "cancelled";

export interface ChatTurn {
  sessionId: string;
  hermesRunId: string;
  status: ChatTurnStatus;
  nextOffset: number;
  hermesSeq: number;
  /** 이 턴을 시작시킨 사용자 메시지 — 브라우저가 사라진 턴을 복구할 때 쓴다. */
  userText: string | null;
  /** 지금 이 턴 로그를 쓰는 릴레이 id (동시 쓰기 방지 리스). */
  writerId: string | null;
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
  userText: row.userText,
  writerId: row.writerId,
  error: row.error,
});

/** 새 턴을 시작한다 — 같은 세션의 이전 턴 프레임 로그는 버린다. */
export const startChatTurn = async (
  sessionId: string,
  hermesRunId: string,
  userText: string,
  writerId: string
): Promise<void> => {
  const db = getDb();
  await db.delete(chatTurnFrames).where(eq(chatTurnFrames.sessionId, sessionId));
  await db
    .insert(chatTurns)
    .values({ sessionId, hermesRunId, userText, writerId })
    .onConflictDoUpdate({
      target: chatTurns.sessionId,
      set: {
        hermesRunId,
        userText,
        writerId,
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

/**
 * 턴 로그의 writer 리스를 인계받는다.
 *
 * **살아 있는 writer가 없을 때만** 성공한다(`updated_at`이 `staleMs`보다 오래됨).
 * 살아 있는 동안에는 기존 writer가 5초마다 heartbeat를 찍으므로, 재개 요청이
 * 여러 개 붙어도 쓰기 권한은 하나뿐이다 — 프레임 로그가 섞이지 않는다.
 */
export const claimChatTurnWriter = async (
  sessionId: string,
  writerId: string,
  staleMs = 15_000
): Promise<boolean> => {
  const staleBefore = new Date(Date.now() - staleMs);
  const result = await getDb()
    .update(chatTurns)
    .set({ writerId, updatedAt: new Date() })
    .where(
      and(
        eq(chatTurns.sessionId, sessionId),
        sql`${chatTurns.status} = 'running'`,
        or(isNull(chatTurns.writerId), lt(chatTurns.updatedAt, staleBefore))
      )
    );
  return (result.rowCount ?? 0) > 0;
};

/**
 * writer heartbeat + 리스 확인. `false`면 다른 릴레이가 인계했다는 뜻 —
 * 이 릴레이는 즉시 쓰기를 멈춰야 한다.
 */
export const touchChatTurnWriter = async (
  sessionId: string,
  writerId: string
): Promise<boolean> => {
  const result = await getDb()
    .update(chatTurns)
    .set({ updatedAt: new Date() })
    .where(and(eq(chatTurns.sessionId, sessionId), eq(chatTurns.writerId, writerId)));
  return (result.rowCount ?? 0) > 0;
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
  const { nextOffset, hermesSeq, ...rest } = patch;
  await getDb()
    .update(chatTurns)
    .set({
      ...rest,
      updatedAt: new Date(),
      // 동시 writer/재생이 겹쳐도 카운터는 절대 뒤로 가지 않는다.
      ...(nextOffset !== undefined
        ? { nextOffset: sql`GREATEST(${chatTurns.nextOffset}, ${nextOffset})` }
        : {}),
      ...(hermesSeq !== undefined
        ? { hermesSeq: sql`GREATEST(${chatTurns.hermesSeq}, ${hermesSeq})` }
        : {}),
    })
    .where(eq(chatTurns.sessionId, sessionId));
};

/**
 * 리스 없이 턴을 마감한다 — **writer가 사라진 경우에만**(`updated_at`이 `staleMs`보다 오래됨) 성공.
 *
 * 소프트 데드라인(240s) 직후 브라우저가 재개하면 writer 리스가 아직 살아 있다고 판정돼
 * 읽기 전용 릴레이가 되고, 그 릴레이는 기록도 상태 마감도 하지 않는다. 그 결과 런은 완주했는데
 * 턴이 영원히 `running`으로 남는다. 이 함수가 그 구멍을 조건부로 막는다(경쟁 writer는 덮어쓰지 않음).
 */
export const finalizeChatTurnIfOwnerGone = async (
  sessionId: string,
  patch: ChatTurnPatch,
  staleMs = 15_000
): Promise<boolean> => {
  if (Object.keys(patch).length === 0) return false;
  const { nextOffset, hermesSeq, ...rest } = patch;
  const staleBefore = new Date(Date.now() - staleMs);
  const result = await getDb()
    .update(chatTurns)
    .set({
      ...rest,
      updatedAt: new Date(),
      ...(nextOffset !== undefined
        ? { nextOffset: sql`GREATEST(${chatTurns.nextOffset}, ${nextOffset})` }
        : {}),
      ...(hermesSeq !== undefined
        ? { hermesSeq: sql`GREATEST(${chatTurns.hermesSeq}, ${hermesSeq})` }
        : {}),
    })
    .where(
      and(
        eq(chatTurns.sessionId, sessionId),
        sql`${chatTurns.status} = 'running'`,
        lt(chatTurns.updatedAt, staleBefore)
      )
    );
  return (result.rowCount ?? 0) > 0;
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
