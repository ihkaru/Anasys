CREATE TABLE "analyst_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"strong_buy" integer DEFAULT 0,
	"buy" integer DEFAULT 0,
	"hold" integer DEFAULT 0,
	"sell" integer DEFAULT 0,
	"strong_sell" integer DEFAULT 0,
	"ratings_trend" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyst_ratings_symbol_id_unique" UNIQUE("symbol_id")
);
--> statement-breakpoint
CREATE TABLE "symbol_earnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"next_earnings_date" timestamp with time zone,
	"next_ex_dividend_date" timestamp with time zone,
	"next_dividend_date" timestamp with time zone,
	"earnings_history" text,
	"revenue_history" text,
	"earnings_trend" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_earnings_symbol_id_unique" UNIQUE("symbol_id")
);
--> statement-breakpoint
CREATE TABLE "symbol_financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol_id" integer NOT NULL,
	"trailing_pe" double precision,
	"forward_pe" double precision,
	"price_to_book" double precision,
	"dividend_yield" double precision,
	"ex_dividend_date" timestamp with time zone,
	"beta" double precision,
	"fifty_two_week_high" double precision,
	"fifty_two_week_low" double precision,
	"fifty_day_average" double precision,
	"two_hundred_day_average" double precision,
	"average_volume" double precision,
	"total_revenue" double precision,
	"revenue_per_share" double precision,
	"gross_profit" double precision,
	"ebitda" double precision,
	"net_income_to_common" double precision,
	"gross_margins" double precision,
	"operating_margins" double precision,
	"profit_margins" double precision,
	"return_on_equity" double precision,
	"return_on_assets" double precision,
	"debt_to_equity" double precision,
	"current_ratio" double precision,
	"quick_ratio" double precision,
	"free_cashflow" double precision,
	"target_mean_price" double precision,
	"target_high_price" double precision,
	"target_low_price" double precision,
	"recommendation_mean" double precision,
	"recommendation_key" text,
	"number_of_analyst_opinions" integer,
	"shares_outstanding" double precision,
	"float_shares" double precision,
	"shares_short" double precision,
	"short_ratio" double precision,
	"held_percent_insiders" double precision,
	"held_percent_institutions" double precision,
	"book_value" double precision,
	"enterprise_value" double precision,
	"trailing_eps" double precision,
	"forward_eps" double precision,
	"peg_ratio" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symbol_financials_symbol_id_unique" UNIQUE("symbol_id")
);
--> statement-breakpoint
ALTER TABLE "analyst_ratings" ADD CONSTRAINT "analyst_ratings_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_earnings" ADD CONSTRAINT "symbol_earnings_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_financials" ADD CONSTRAINT "symbol_financials_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;