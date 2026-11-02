CREATE TABLE "ledger_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'card' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_budgets" (
	"month" text NOT NULL,
	"category_id" integer NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "ledger_budgets_month_category_id_pk" PRIMARY KEY("month","category_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"emoji" text DEFAULT '🧾' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_date" text NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"amount" integer NOT NULL,
	"category_id" integer,
	"asset_id" integer,
	"memo" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"member" text DEFAULT 'wonchan' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_months" (
	"month" text PRIMARY KEY NOT NULL,
	"total_budget" integer,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_asset_id_ledger_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."ledger_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_assets_name_uniq" ON "ledger_assets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ledger_categories_kind_idx" ON "ledger_categories" USING btree ("kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_categories_kind_name_uniq" ON "ledger_categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "ledger_entries_date_idx" ON "ledger_entries" USING btree ("entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_member_idx" ON "ledger_entries" USING btree ("member");