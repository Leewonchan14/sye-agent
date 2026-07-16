import { neon } from "@neondatabase/serverless";
import { v4 as uuidv4 } from "uuid";

type SqlQueryResult = Record<string, unknown>[];

let sql:
  | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlQueryResult>)
  | undefined;

let stateInitPromise: Promise<void> | undefined;

const ensureStateTable = async (): Promise<void> => {
  if (stateInitPromise) return stateInitPromise;

  stateInitPromise = (async () => {
    try {
      await getSql()`CREATE TABLE IF NOT EXISTS session_state (
          session_id TEXT PRIMARY KEY,
          messages JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )`;
    } catch (err) {
      console.error("Failed to initialize session_state table:", err);
    }
  })();

  return stateInitPromise;
};

const getSql = () => {
  if (!sql) {
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
};

/** 세션의 전체 UIMessage[] 상태를 JSONB로 저장합니다. */
export const saveSessionState = async (
  sessionId: string,
  messages: unknown[]
): Promise<void> => {
  await ensureStateTable();
  await getSql()`
    INSERT INTO session_state (session_id, messages, updated_at)
    VALUES (${sessionId}, ${JSON.stringify(messages)}, NOW())
    ON CONFLICT (session_id)
    DO UPDATE SET messages = ${JSON.stringify(messages)}, updated_at = NOW()
  `;
};

/** 세션의 전체 UIMessage[] 상태를 불러옵니다. 없으면 null을 반환합니다. */
export const getSessionState = async (sessionId: string): Promise<unknown[] | null> => {
  await ensureStateTable();
  const rows = await getSql()`
    SELECT messages FROM session_state WHERE session_id = ${sessionId}
  `;
  const row = rows[0] as { messages: unknown } | undefined;
  if (!row) return null;
  // neon returns JSONB columns as already-parsed objects (not strings)
  const msgs = row.messages;
  return (typeof msgs === "string" ? JSON.parse(msgs) : msgs) as unknown[];
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
  session_id: string;
  title: string;
  message_count: number;
  last_activity: string;
}

const encodeCursor = (updatedAt: string, sessionId: string): string =>
  Buffer.from(JSON.stringify([updatedAt, sessionId])).toString("base64");

const decodeCursor = (cursor: string): { updatedAt: string; sessionId: string } => {
  const [updatedAt, sessionId] = JSON.parse(Buffer.from(cursor, "base64").toString());
  return { updatedAt, sessionId };
};

export const listSessions = async (): Promise<SessionInfo[]> => {
  await ensureStateTable();
  const rows = await getSql()`SELECT
      session_id,
      COALESCE(
        messages->0->'parts'->0->>'text',
        'New Chat'
      ) AS title,
      jsonb_array_length(messages) AS message_count,
      updated_at AS last_activity
    FROM session_state
    ORDER BY updated_at DESC
    LIMIT 50`;

  return (rows as unknown as SessionRow[]).map((r) => ({
    id: r.session_id,
    title: r.title,
    messageCount: r.message_count,
    lastActivity: r.last_activity,
  }));
};

export const listSessionsPaginated = async (
  opts: { cursor?: string; limit?: number } = {}
): Promise<{ sessions: SessionInfo[]; nextCursor: string | null }> => {
  await ensureStateTable();
  const limit = opts.limit ?? 20;
  const take = limit + 1; // fetch one extra to detect next page

  let rows: SessionRow[];

  if (opts.cursor) {
    const { updatedAt, sessionId } = decodeCursor(opts.cursor);
    rows = (await getSql()`
      SELECT
        session_id,
        COALESCE(
          messages->0->'parts'->0->>'text',
          'New Chat'
        ) AS title,
        jsonb_array_length(messages) AS message_count,
        updated_at AS last_activity
      FROM session_state
      WHERE (updated_at, session_id) < (${updatedAt}::timestamptz, ${sessionId})
      ORDER BY updated_at DESC, session_id DESC
      LIMIT ${take}
    `) as unknown as SessionRow[];
  } else {
    rows = (await getSql()`
      SELECT
        session_id,
        COALESCE(
          messages->0->'parts'->0->>'text',
          'New Chat'
        ) AS title,
        jsonb_array_length(messages) AS message_count,
        updated_at AS last_activity
      FROM session_state
      ORDER BY updated_at DESC, session_id DESC
      LIMIT ${take}
    `) as unknown as SessionRow[];
  }

  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);

  const sessions = slice.map((r) => ({
    id: r.session_id,
    title: r.title,
    messageCount: r.message_count,
    lastActivity: r.last_activity,
  }));

  const nextCursor =
    hasMore && slice.length > 0
      ? encodeCursor(
          slice[slice.length - 1].last_activity,
          slice[slice.length - 1].session_id
        )
      : null;

  return { sessions, nextCursor };
};

export const getOrCreateSession = (sessionId?: string): string => {
  return sessionId ?? uuidv4();
};
