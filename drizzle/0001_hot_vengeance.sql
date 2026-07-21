CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "kakao_chat" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"user" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kakao_chat_date_idx" ON "kakao_chat" USING btree ("date");--> statement-breakpoint
CREATE INDEX "kakao_chat_message_trgm_idx" ON "kakao_chat" USING gin ("message" gin_trgm_ops);