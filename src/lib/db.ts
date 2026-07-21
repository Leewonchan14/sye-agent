import { v4 as uuidv4 } from "uuid";
import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { sessionState } = schema;

/** 세션의 전체 UIMessage[] 상태를 JSONB로 저장합니다. */
export const saveSessionState = async (
  sessionId: string,
  messages: unknown[]
): Promise<void> => {
  const db = getDb();
  await db
    .insert(sessionState)
    .values({
      sessionId,
      messages: messages as unknown[],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sessionState.sessionId,
      set: {
        messages: messages as unknown[],
        updatedAt: new Date(),
      },
    });
};

/** 세션의 전체 UIMessage[] 상태를 불러옵니다. 없으면 null을 반환합니다. */
export const getSessionState = async (
  sessionId: string
): Promise<unknown[] | null> => {
  const db = getDb();
  const rows = await db
    .select({ messages: sessionState.messages })
    .from(sessionState)
    .where(eq(sessionState.sessionId, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.messages as unknown[];
};

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

export interface SessionsPage {
  sessions: SessionInfo[];
  nextCursor: string | null;
}

interface SessionRow {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: Date | null;
}

const encodeCursor = (
  updatedAt: string,
  sessionId: string
): string =>
  Buffer.from(JSON.stringify([updatedAt, sessionId])).toString("base64");

const decodeCursor = (
  cursor: string
): { updatedAt: string; sessionId: string } => {
  const [updatedAt, sessionId] = JSON.parse(
    Buffer.from(cursor, "base64").toString()
  );
  return { updatedAt, sessionId };
};

export const listSessions = async (): Promise<SessionInfo[]> => {
  const db = getDb();
  const rows = await db
    .select({
      id: sessionState.sessionId,
      title:
        sql<string>`COALESCE(${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`,
      messageCount: sql<number>`jsonb_array_length(${sessionState.messages})`,
      lastActivity: sessionState.updatedAt,
    })
    .from(sessionState)
    .orderBy(desc(sessionState.updatedAt))
    .limit(50);

  return rows.map(toSessionInfo);
};

export const listSessionsPaginated = async (
  opts: { cursor?: string; limit?: number } = {}
): Promise<SessionsPage> => {
  const db = getDb();
  const limit = opts.limit ?? 20;
  const take = limit + 1; // fetch one extra to detect next page

  const baseQuery = db
    .select({
      id: sessionState.sessionId,
      title:
        sql<string>`COALESCE(${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`,
      messageCount: sql<number>`jsonb_array_length(${sessionState.messages})`,
      lastActivity: sessionState.updatedAt,
    })
    .from(sessionState);

  let rows: SessionRow[];

  if (opts.cursor) {
    const { updatedAt, sessionId } = decodeCursor(opts.cursor);
    rows = await baseQuery
      .where(
        sql`(${sessionState.updatedAt}, ${sessionState.sessionId}) < (${updatedAt}::timestamptz, ${sessionId})`
      )
      .orderBy(
        desc(sessionState.updatedAt),
        desc(sessionState.sessionId)
      )
      .limit(take);
  } else {
    rows = await baseQuery
      .orderBy(
        desc(sessionState.updatedAt),
        desc(sessionState.sessionId)
      )
      .limit(take);
  }

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);

  const nextCursor =
    hasMore && slice.length > 0
      ? encodeCursor(
          toDateString(slice[slice.length - 1].lastActivity),
          slice[slice.length - 1].id
        )
      : null;

  return { sessions: slice.map(toSessionInfo), nextCursor };
};

function toSessionInfo(row: SessionRow): SessionInfo {
  return {
    id: row.id,
    title: row.title,
    messageCount: row.messageCount,
    lastActivity: toDateString(row.lastActivity),
  };
}

const toDateString = (d: Date | string | null): string => {
  if (!d) return new Date(0).toISOString();
  if (typeof d === "string") return d;
  return d.toISOString();
};

export const getOrCreateSession = (sessionId?: string): string => {
  return sessionId ?? uuidv4();
};
