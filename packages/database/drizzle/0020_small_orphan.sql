ALTER TABLE "pricing" ADD COLUMN "stripe_product_id" text;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "stripe_price_id_monthly" text;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "stripe_price_id_yearly" text;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "max_vault_size_mb" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "max_ai_tokens" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_status" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_tokens_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "vault_size_used_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_plan_id_pricing_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pricing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");