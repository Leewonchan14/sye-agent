ALTER TABLE "instructions" ALTER COLUMN "is_active" SET DEFAULT true;
--> statement-breakpoint
UPDATE "instructions" SET "is_active" = true WHERE "is_active" IS NULL;
