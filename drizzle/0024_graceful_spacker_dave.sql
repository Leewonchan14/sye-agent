CREATE TABLE "auth_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_login_attempts_created_idx" ON "auth_login_attempts" USING btree ("created_at");