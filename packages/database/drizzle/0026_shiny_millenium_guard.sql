ALTER TABLE "workspace_addons" DROP CONSTRAINT "workspace_addons_mayar_subscription_id_unique";--> statement-breakpoint
DROP INDEX "orders_mayar_invoice_id_unique";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "mayar_payment_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "mayar_invoice_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "mayar_subscription_id";--> statement-breakpoint
ALTER TABLE "workspace_addons" DROP COLUMN "mayar_subscription_id";