CREATE EXTENSION IF NOT EXISTS vector;

DROP INDEX IF EXISTS "kakao_chat_message_trgm_idx";--> statement-breakpoint
ALTER TABLE "kakao_chat" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
CREATE INDEX "kakao_chat_embedding_idx" ON "kakao_chat" USING hnsw ("embedding" vector_cosine_ops);