CREATE TABLE "system_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_billing_interval" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_overdue_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_last_reminder_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_tokens_reset_at" timestamp DEFAULT now() NOT NULL;