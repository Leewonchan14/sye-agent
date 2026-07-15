import { neon } from "@neondatabase/serverless";

type SqlQueryResult = Record<string, unknown>[];

let sql:
  | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlQueryResult>)
  | undefined;

let initPromise: Promise<void> | undefined;

const ensureTable = async (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await getSql()`CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`;
      await getSql()`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)`;
    } catch (err) {
      console.error("Failed to initialize database table:", err);
    }
  })();

  return initPromise;
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
  createdAt: string;
}

interface DbRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
}

export const getMessages = async (sessionId: string): Promise<ChatMessage[]> => {
  await ensureTable();
  const rows = await getSql()`
    SELECT id, role, content, created_at
    FROM chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;

  return (rows as unknown as DbRow[]).map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
};

export const saveMessage = async (
  sessionId: string,
  role: string,
  content: string
): Promise<void> => {
  await ensureTable();
  await getSql()`
    INSERT INTO chat_messages (session_id, role, content)
    VALUES (${sessionId}, ${role}, ${content})
  `;
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
