import { neon } from "@neondatabase/serverless";

type SqlQueryResult = Record<string, unknown>[];

let sql:
  | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlQueryResult>)
  | undefined;

let tableInitPromise: Promise<void> | undefined;

const ensureTable = async (): Promise<void> => {
  if (tableInitPromise) return tableInitPromise;

  tableInitPromise = (async () => {
    try {
      await getSql()`CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`;
      await getSql()`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)`;
      await getSql()`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reasoning TEXT`;
    } catch (err) {
      console.error("Failed to initialize database table:", err);
    }
  })();

  return tableInitPromise;
};

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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning?: string;
  createdAt: string;
}

interface DbRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoning: string | null;
  created_at: string;
}

export const getMessages = async (sessionId: string): Promise<ChatMessage[]> => {
  await ensureTable();
  const rows = await getSql()`
    SELECT id, role, content, reasoning, created_at
    FROM chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;

  return (rows as unknown as DbRow[]).map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    reasoning: r.reasoning ?? undefined,
    createdAt: r.created_at,
  }));
};

export const saveMessage = async (
  sessionId: string,
  role: string,
  content: string,
  reasoning?: string | null
): Promise<void> => {
  await ensureTable();
  await getSql()`
    INSERT INTO chat_messages (session_id, role, content, reasoning)
    VALUES (${sessionId}, ${role}, ${content}, ${reasoning ?? null})
  `;
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
export const getSessionState = async (
  sessionId: string
): Promise<unknown[] | null> => {
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
  await ensureTable();
  const rows = await getSql()`
    SELECT
      session_id,
      COALESCE(
        (SELECT content FROM chat_messages cm2
         WHERE cm2.session_id = cm.session_id AND cm2.role = 'user'
         ORDER BY cm2.created_at ASC LIMIT 1),
        'New Chat'
      ) AS title,
      COUNT(*)::int AS message_count,
      MAX(created_at) AS last_activity
    FROM chat_messages cm
    GROUP BY session_id
    ORDER BY last_activity DESC
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
