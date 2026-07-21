import {
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const sessionState = pgTable("session_state", {
  sessionId: text("session_id").primaryKey(),
  messages: jsonb("messages").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
