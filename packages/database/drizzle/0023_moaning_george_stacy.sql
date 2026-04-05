ALTER TABLE "pricing" ADD COLUMN "xendit_product_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "xendit_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "xendit_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "xendit_current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_xendit_customer_id_unique" UNIQUE("xendit_customer_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_xendit_subscription_id_unique" UNIQUE("xendit_subscription_id");