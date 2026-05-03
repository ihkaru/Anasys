CREATE TYPE "public"."alert_status" AS ENUM('ACTIVE', 'PAUSED', 'TRIGGERED');--> statement-breakpoint
ALTER TYPE "public"."asset_type" ADD VALUE 'FOREX';--> statement-breakpoint
ALTER TYPE "public"."asset_type" ADD VALUE 'INDEX';--> statement-breakpoint
ALTER TYPE "public"."asset_type" ADD VALUE 'COMMODITY';--> statement-breakpoint
ALTER TYPE "public"."asset_type" ADD VALUE 'FUTURES';--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message" text,
	"data_snapshot" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol_id" integer NOT NULL,
	"name" text NOT NULL,
	"pine_script" text NOT NULL,
	"interval" text DEFAULT '1h' NOT NULL,
	"status" "alert_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"cooldown_minutes" integer DEFAULT 60,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;