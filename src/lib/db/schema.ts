import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const sessionState = pgTable(
  "session_state",
  {
    sessionId: text("session_id").primaryKey(),
    title: text("title"),
    messages: jsonb("messages").notNull(),
    messagesText: text("messages_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    titleTrgmIdx: index("session_state_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`
    ),
    messagesTextTrgmIdx: index("session_state_messages_text_trgm_idx").using(
      "gin",
      sql`${table.messagesText} gin_trgm_ops`
    ),
  })
);

export const instructions = pgTable(
  "instructions",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    content: text("content").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    activeIdx: index("instructions_active_idx").on(table.isActive),
  })
);

export const kakaoChat = pgTable(
  "kakao_chat",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    user: text("user").notNull(),
    message: text("message").notNull(),
    embedding: vector("embedding", { dimensions: 384 }),
  },
  (table) => ({
    dateIdx: index("kakao_chat_date_idx").on(table.date),
    embeddingIdx: index("kakao_chat_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    dedupIdx: uniqueIndex("kakao_chat_dedup_idx").on(
      table.date,
      table.user,
      table.message
    ),
  })
);
