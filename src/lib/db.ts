import { neon } from "@neondatabase/serverless";

let sql:
  ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>) | undefined;

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
  const rows = await getSql()`
    SELECT id, role, content, created_at
    FROM chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;

  return (rows as DbRow[]).map((r) => ({
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
  await getSql()`
    INSERT INTO chat_messages (session_id, role, content)
    VALUES (${sessionId}, ${role}, ${content})
  `;
};

export const getOrCreateSession = (sessionId?: string): string => {
  return sessionId ?? crypto.randomUUID();
};
