ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_mayar_customer_id_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_mayar_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "mayar_product_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "mayar_customer_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "mayar_subscription_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "mayar_current_period_end";