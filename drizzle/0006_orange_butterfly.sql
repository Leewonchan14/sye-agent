CREATE TABLE "system_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "system_prompts_active_idx" ON "system_prompts" USING btree ("is_active");