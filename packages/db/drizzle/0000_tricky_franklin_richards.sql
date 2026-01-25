CREATE TYPE "public"."asset_type" AS ENUM('STOCK', 'CRYPTO');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "market_data" (
	"symbol_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	"interval" text DEFAULT '1d' NOT NULL,
	CONSTRAINT "market_data_symbol_id_timestamp_interval_pk" PRIMARY KEY("symbol_id","timestamp","interval")
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "symbol_categories" (
	"symbol_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	CONSTRAINT "symbol_categories_symbol_id_category_id_pk" PRIMARY KEY("symbol_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"type" "asset_type" NOT NULL,
	"provider" text DEFAULT 'yahoo',
	"is_active" boolean DEFAULT true,
	"icon_url" text,
	"last_synced_at" timestamp with time zone,
	"description" text,
	"sector" text,
	"industry" text,
	"website" text,
	"country" text,
	"metadata_updated_at" timestamp with time zone,
	CONSTRAINT "symbols_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"google_id" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"watchlist_id" integer NOT NULL,
	"symbol_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_items_watchlist_id_symbol_id_pk" PRIMARY KEY("watchlist_id","symbol_id")
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_data" ADD CONSTRAINT "market_data_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_categories" ADD CONSTRAINT "symbol_categories_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_categories" ADD CONSTRAINT "symbol_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;