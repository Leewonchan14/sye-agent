import type { TextUIPart, UIMessage } from "ai";
import { desc, eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { getDb, schema } from "@/lib/db/db";

const { sessionState } = schema;

/** 세션의 전체 UIMessage[] 상태를 JSONB로 저장합니다. */
export const saveSessionState = async (
  sessionId: string,
  messages: UIMessage[]
): Promise<void> => {
  const db = getDb();

  // messagesText 검색 인덱스를 위해 모든 텍스트 추출
  // Title: 첫 번째 텍스트 파트
  let title: string | null = null;
  for (const msg of messages) {
    const textParts = msg.parts.filter((p): p is TextUIPart => p.type === "text");
    const trimmed = textParts.find((p) => p.text.trim());
    if (trimmed) {
      title = trimmed.text.trim();
      break;
    }
  }

  // messagesText: 모든 메시지의 텍스트를 연결
  const allText = messages
    .flatMap((msg) =>
      msg.parts
        .filter((p): p is TextUIPart => p.type === "text")
        .map((p) => p.text)
        .filter(Boolean)
    )
    .join("\n");

  await db
    .insert(sessionState)
    .values({
      sessionId,
      title,
      messages,
      messagesText: allText || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sessionState.sessionId,
      set: {
        title,
        messages,
        messagesText: allText || null,
        updatedAt: new Date(),
      },
    });
};

/** 세션의 전체 UIMessage[] 상태를 불러옵니다. 없으면 null을 반환합니다. */
export const getSessionState = async (sessionId: string): Promise<UIMessage[] | null> => {
  const db = getDb();
  const rows = await db
    .select({ messages: sessionState.messages })
    .from(sessionState)
    .where(eq(sessionState.sessionId, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.messages as UIMessage[];
};

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

export interface SessionSearchResult {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
  snippet: string;
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

const encodeCursor = (updatedAt: string, sessionId: string): string =>
  Buffer.from(JSON.stringify([updatedAt, sessionId])).toString("base64");

const decodeCursor = (cursor: string): { updatedAt: string; sessionId: string } => {
  const [updatedAt, sessionId] = JSON.parse(Buffer.from(cursor, "base64").toString());
  return { updatedAt, sessionId };
};

export const listSessions = async (): Promise<SessionInfo[]> => {
  const db = getDb();
  const rows = await db
    .select({
      id: sessionState.sessionId,
      title: sql<string>`COALESCE(${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`,
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
      title: sql<string>`COALESCE(${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`,
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
      .orderBy(desc(sessionState.updatedAt), desc(sessionState.sessionId))
      .limit(take);
  } else {
    rows = await baseQuery
      .orderBy(desc(sessionState.updatedAt), desc(sessionState.sessionId))
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

export const searchSessions = async (
  query: string,
  limit: number = 20
): Promise<SessionSearchResult[]> => {
  const db = getDb();

  if (!query.trim()) return [];

  const pattern = `%${query}%`;

  // title / messages_text (trigram index) + JSONB fallback for legacy rows
  const titleExpr = sql<string>`COALESCE(${sessionState.title}, 
      ${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`;

  const rows = await db
    .select({
      id: sessionState.sessionId,
      title: titleExpr,
      messageCount: sql<number>`jsonb_array_length(${sessionState.messages})`,
      lastActivity: sessionState.updatedAt,
      snippet: sql<string>`COALESCE(
          LEFT(${sessionState.messagesText}, 200),
          ${sessionState.messages}->0->'parts'->0->>'text',
          ''
        )`,
    })
    .from(sessionState)
    .where(
      sql`(
        ${sessionState.title} ILIKE ${pattern}
        OR ${sessionState.messagesText} ILIKE ${pattern}
        OR ${sessionState.messages}::text ILIKE ${pattern}
      )`
    )
    .orderBy(desc(sessionState.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? "New Chat",
    messageCount: row.messageCount,
    lastActivity: toDateString(row.lastActivity),
    snippet: row.snippet ?? "",
  }));
};

export const getOrCreateSession = (sessionId?: string): string => {
  return sessionId ?? uuidv4();
};

const { instructions: instructionsTable } = schema;

export interface Instructions {
  id: number;
  label: string;
  content: string;
  isActive: boolean;
  createdAt: Date | null;
}

/** 현재 활성화된 지시 사항을 반환합니다. 없으면 null. */
export const getActiveInstructions = async (): Promise<Instructions | null> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(instructionsTable)
    .where(eq(instructionsTable.isActive, true))
    .limit(1);
  return rows[0] ?? null;
};

/** 모든 지시 사항을 최신순으로 반환합니다. */
export const listInstructions = async (): Promise<Instructions[]> => {
  const db = getDb();
  return db.select().from(instructionsTable).orderBy(desc(instructionsTable.createdAt));
};

/**
 * 새 지시 사항을 저장하고 활성화합니다.
 * 기존 활성 지시 사항은 비활성화됩니다.
 */
export const saveInstructions = async (
  label: string,
  content: string
): Promise<Instructions> => {
  const db = getDb();

  await db
    .update(instructionsTable)
    .set({ isActive: false })
    .where(eq(instructionsTable.isActive, true));

  const rows = await db
    .insert(instructionsTable)
    .values({ label, content, isActive: true })
    .returning();

  return rows[0];
};
