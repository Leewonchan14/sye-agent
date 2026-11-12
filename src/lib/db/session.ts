import type { TextUIPart, UIMessage } from "ai";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/db";

const { sessionState } = schema;

/** 세션의 전체 UIMessage[] 상태를 JSONB로 저장합니다. */
export class SessionAccessError extends Error {
  constructor() {
    super("이 대화에 접근할 수 없습니다.");
    this.name = "SessionAccessError";
  }
}

/**
 * 세션을 사용자에게 묶는다. 처음 보는 세션이면 빈 상태로 만들고,
 * 이미 다른 사용자의 세션이면 SessionAccessError를 던진다.
 */
export const claimSession = async (userId: string, sessionId: string): Promise<void> => {
  const db = getDb();
  await db
    .insert(sessionState)
    .values({ sessionId, userId, messages: [] })
    .onConflictDoNothing({ target: sessionState.sessionId });
  await assertSessionOwner(userId, sessionId);
};

/** 세션이 이 사용자의 것인지. 세션이 없으면 false. */
export const isSessionOwner = async (userId: string, sessionId: string) => {
  const rows = await getDb()
    .select({ userId: sessionState.userId })
    .from(sessionState)
    .where(eq(sessionState.sessionId, sessionId))
    .limit(1);
  return rows[0]?.userId === userId;
};

/** 세션 주인이 아니면(또는 세션이 없으면) SessionAccessError를 던진다. */
export const assertSessionOwner = async (
  userId: string,
  sessionId: string
): Promise<void> => {
  if (!(await isSessionOwner(userId, sessionId))) throw new SessionAccessError();
};

export const saveSessionState = async (
  userId: string,
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

  const saved = await db
    .insert(sessionState)
    .values({
      sessionId,
      userId,
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
      // 다른 사용자의 세션은 덮어쓰지 않는다.
      setWhere: eq(sessionState.userId, userId),
    })
    .returning();
  if (saved.length === 0) throw new SessionAccessError();
};

/** 세션의 전체 UIMessage[] 상태를 불러옵니다. 없으면 null을 반환합니다. */
export const getSessionState = async (
  userId: string,
  sessionId: string
): Promise<UIMessage[] | null> => {
  const db = getDb();
  const rows = await db
    .select({ messages: sessionState.messages })
    .from(sessionState)
    .where(and(eq(sessionState.sessionId, sessionId), eq(sessionState.userId, userId)))
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

export const listSessionsPaginated = async (
  userId: string,
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

  // 빈 세션(제출 직전 claimSession으로 만든 행)은 목록에 띄우지 않는다.
  const mine = and(
    eq(sessionState.userId, userId),
    sql`jsonb_array_length(${sessionState.messages}) > 0`
  );

  let rows: SessionRow[];

  if (opts.cursor) {
    const { updatedAt, sessionId } = decodeCursor(opts.cursor);
    rows = await baseQuery
      .where(
        and(
          mine,
          sql`(${sessionState.updatedAt}, ${sessionState.sessionId}) < (${updatedAt}::timestamptz, ${sessionId})`
        )
      )
      .orderBy(desc(sessionState.updatedAt), desc(sessionState.sessionId))
      .limit(take);
  } else {
    rows = await baseQuery
      .where(mine)
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
  userId: string,
  query: string,
  opts: { cursor?: string; limit?: number } = {}
): Promise<{ results: SessionSearchResult[]; nextCursor: string | null }> => {
  const db = getDb();

  if (!query.trim()) return { results: [], nextCursor: null };

  const limit = opts.limit ?? 20;
  const take = limit + 1; // fetch one extra to detect next page
  const pattern = `%${query}%`;

  const titleExpr = sql<string>`COALESCE(${sessionState.title},
      ${sessionState.messages}->0->'parts'->0->>'text', 'New Chat')`;

  // snippet: 검색어가 포함된 문장들을 모두 보여줌
  // 문장 기준: . ! ? 줄바꿈, 각 문장은 150자, 합쳐서 최대 500자
  const snippetExpr = sql<string>`COALESCE(
      CASE
        WHEN position(lower(${query}) in lower(${sessionState.messagesText})) > 0 THEN
        (
          SELECT LEFT(string_agg(trim(LEFT(sentence, 150)), chr(10) || '...' || chr(10)), 500)
          FROM regexp_split_to_table(${sessionState.messagesText}, '[.!?\t' || chr(10) || ']+') AS sentence
          WHERE sentence ILIKE '%' || ${query} || '%'
            AND trim(sentence) IS DISTINCT FROM trim(COALESCE(${sessionState.title}, ''))
        )
        ELSE LEFT(${sessionState.messagesText}, 200)
      END,
      ''
    )`;

  const searchCondition = and(
    eq(sessionState.userId, userId),
    sql`(
    ${sessionState.title} ILIKE ${pattern}
    OR ${sessionState.messagesText} ILIKE ${pattern}
  )`
  );

  const whereClause = opts.cursor
    ? (() => {
        const { updatedAt, sessionId } = decodeCursor(opts.cursor!);
        return and(
          searchCondition,
          sql`(${sessionState.updatedAt}, ${sessionState.sessionId}) < (${updatedAt}::timestamptz, ${sessionId})`
        );
      })()
    : searchCondition;

  const rows = await db
    .select({
      id: sessionState.sessionId,
      title: titleExpr,
      messageCount: sql<number>`jsonb_array_length(${sessionState.messages})`,
      lastActivity: sessionState.updatedAt,
      snippet: snippetExpr,
    })
    .from(sessionState)
    .where(whereClause)
    .orderBy(desc(sessionState.updatedAt), desc(sessionState.sessionId))
    .limit(take);

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);

  const nextCursor =
    hasMore && slice.length > 0
      ? encodeCursor(
          toDateString(slice[slice.length - 1].lastActivity),
          slice[slice.length - 1].id
        )
      : null;

  return {
    results: slice.map((row): SessionSearchResult => ({
      id: row.id,
      title: row.title ?? "New Chat",
      messageCount: row.messageCount,
      lastActivity: toDateString(row.lastActivity),
      snippet: row.snippet ?? "",
    })),
    nextCursor,
  };
};
