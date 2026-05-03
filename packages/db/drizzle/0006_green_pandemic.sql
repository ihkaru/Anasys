CREATE TYPE "public"."backfill_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'INCREMENTAL', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."alert_status" ADD VALUE 'COOLDOWN';--> statement-breakpoint
ALTER TYPE "public"."alert_status" ADD VALUE 'RESOLVED';--> statement-breakpoint
ALTER TABLE "alert_history" ADD COLUMN "delivery_status" "delivery_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_history" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "params" text;--> statement-breakpoint
ALTER TABLE "backfill_progress" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "backfill_progress" ADD COLUMN "backfill_status" "backfill_status" DEFAULT 'PENDING';