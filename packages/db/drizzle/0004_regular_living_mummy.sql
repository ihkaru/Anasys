CREATE TABLE "backfill_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"interval" text NOT NULL,
	"target_start_date" timestamp with time zone NOT NULL,
	"last_backfilled_at" timestamp with time zone,
	"is_completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporate_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"type" text NOT NULL,
	"execution_date" timestamp with time zone NOT NULL,
	"amount" double precision,
	"ratio" text,
	"description" text,
	"source" text DEFAULT 'YAHOO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insider_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"insider_name" text NOT NULL,
	"position" text,
	"transaction_date" timestamp with time zone NOT NULL,
	"transaction_type" text NOT NULL,
	"shares" double precision,
	"price" double precision,
	"value" double precision,
	"source" text DEFAULT 'YAHOO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "macro_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"indicator_code" text NOT NULL,
	"indicator_name" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"country" text DEFAULT 'USA',
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_items" DROP CONSTRAINT "watchlist_items_watchlist_id_symbol_id_pk";--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_symbol_id_source_pk" PRIMARY KEY("watchlist_id","symbol_id","source");--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "source" text DEFAULT 'YAHOO' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_data" ADD COLUMN "adj_close" double precision;--> statement-breakpoint
ALTER TABLE "symbol_financials" ADD COLUMN "market_cap" double precision;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "exchange" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "tradingview_symbol" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "tradingview_exchange" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "isin" text;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "figi" text;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "source" text DEFAULT 'YAHOO' NOT NULL;--> statement-breakpoint
ALTER TABLE "backfill_progress" ADD CONSTRAINT "backfill_progress_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insider_transactions" ADD CONSTRAINT "insider_transactions_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;