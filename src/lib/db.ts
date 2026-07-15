import { neon } from "@neondatabase/serverless";

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

interface SessionRow {
  session_id: string;
  title: string;
  message_count: number;
  last_activity: string;
}

export const listSessions = async (): Promise<SessionInfo[]> => {
  await ensureStateTable();
  const rows = await getSql()`
    SELECT
      session_id,
      COALESCE(
        messages->0->'parts'->0->>'text',
        'New Chat'
      ) AS title,
      jsonb_array_length(messages) AS message_count,
      updated_at AS last_activity
    FROM session_state
    ORDER BY updated_at DESC
    LIMIT 50
  `;

  return (rows as unknown as SessionRow[]).map((r) => ({
    id: r.session_id,
    title: r.title,
    messageCount: r.message_count,
    lastActivity: r.last_activity,
  }));
};

export const getOrCreateSession = (sessionId?: string): string => {
  return sessionId ?? crypto.randomUUID();
};
