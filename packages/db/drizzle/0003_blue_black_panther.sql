CREATE TYPE "public"."data_source" AS ENUM('YAHOO', 'TRADINGVIEW', 'CCXT');--> statement-breakpoint
ALTER TABLE "market_data" DROP CONSTRAINT "market_data_symbol_id_timestamp_interval_pk";--> statement-breakpoint
ALTER TABLE "market_data" ADD CONSTRAINT "market_data_symbol_id_timestamp_interval_source_pk" PRIMARY KEY("symbol_id","timestamp","interval","source");--> statement-breakpoint
ALTER TABLE "market_data" ADD COLUMN "source" text DEFAULT 'YAHOO' NOT NULL;