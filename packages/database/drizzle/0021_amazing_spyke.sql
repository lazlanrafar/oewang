ALTER TABLE "orders" RENAME COLUMN "stripe_payment_intent_id" TO "mayar_payment_id";--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "stripe_invoice_id" TO "mayar_invoice_id";--> statement-breakpoint
ALTER TABLE "workspace_addons" RENAME COLUMN "stripe_subscription_id" TO "mayar_subscription_id";--> statement-breakpoint
ALTER TABLE "workspace_addons" DROP CONSTRAINT "workspace_addons_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_stripe_subscription_id_unique";--> statement-breakpoint
DROP INDEX "orders_stripe_invoice_id_unique";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "mayar_subscription_id" text;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "mayar_product_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "mayar_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "mayar_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "mayar_current_period_end" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_mayar_invoice_id_unique" ON "orders" USING btree ("mayar_invoice_id");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "pricing" DROP COLUMN "stripe_product_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "stripe_current_period_end";--> statement-breakpoint
ALTER TABLE "workspace_addons" ADD CONSTRAINT "workspace_addons_mayar_subscription_id_unique" UNIQUE("mayar_subscription_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_mayar_customer_id_unique" UNIQUE("mayar_customer_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_mayar_subscription_id_unique" UNIQUE("mayar_subscription_id");