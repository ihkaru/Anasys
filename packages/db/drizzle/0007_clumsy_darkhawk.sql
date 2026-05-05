DROP TABLE "market_data" CASCADE;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "lot_size" integer DEFAULT 1;