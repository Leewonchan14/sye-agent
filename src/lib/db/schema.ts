import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
