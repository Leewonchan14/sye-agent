ALTER TABLE "ledger_categories" ADD COLUMN "icon" text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_categories" ADD COLUMN "color" text DEFAULT 'neutral' NOT NULL;
--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'utensils', "color" = 'peach' WHERE "kind" = 'expense' AND "name" = '식비';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'coffee', "color" = 'latte' WHERE "kind" = 'expense' AND "name" = '카페';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'bus', "color" = 'blue' WHERE "kind" = 'expense' AND "name" = '교통';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'basket', "color" = 'sage' WHERE "kind" = 'expense' AND "name" = '생활';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'bag', "color" = 'pink' WHERE "kind" = 'expense' AND "name" = '쇼핑';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'clapperboard', "color" = 'lavender' WHERE "kind" = 'expense' AND "name" = '문화';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'pill', "color" = 'red' WHERE "kind" = 'expense' AND "name" = '의료';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'house', "color" = 'clay' WHERE "kind" = 'expense' AND "name" = '주거';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'bed', "color" = 'teal' WHERE "kind" = 'expense' AND "name" = '숙박';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'receipt', "color" = 'neutral' WHERE "kind" = 'expense' AND "name" = '기타';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'wallet', "color" = 'sage' WHERE "kind" = 'income' AND "name" = '급여';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'gift', "color" = 'pink' WHERE "kind" = 'income' AND "name" = '용돈';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'landmark', "color" = 'blue' WHERE "kind" = 'income' AND "name" = '이자';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'plus', "color" = 'neutral' WHERE "kind" = 'income' AND "name" = '기타';--> statement-breakpoint
UPDATE "ledger_categories" SET "icon" = 'users', "color" = 'teal' WHERE "kind" = 'income' AND "name" = '모임 통장';
