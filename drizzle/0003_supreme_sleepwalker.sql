ALTER TABLE "session_state" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "session_state" ADD COLUMN "messages_text" text;--> statement-breakpoint
CREATE INDEX "session_state_title_trgm_idx" ON "session_state" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "session_state_messages_text_trgm_idx" ON "session_state" USING gin ("messages_text" gin_trgm_ops);