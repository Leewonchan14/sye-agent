ALTER TABLE "calendar_diaries" ADD COLUMN "comments" jsonb DEFAULT '[]'::jsonb NOT NULL;
