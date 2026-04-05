ALTER TABLE "workspace_addons" ALTER COLUMN "mayar_subscription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "xendit_payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "xendit_invoice_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "xendit_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspace_addons" ADD COLUMN "xendit_subscription_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_xendit_invoice_id_unique" ON "orders" USING btree ("xendit_invoice_id");--> statement-breakpoint
ALTER TABLE "workspace_addons" ADD CONSTRAINT "workspace_addons_xendit_subscription_id_unique" UNIQUE("xendit_subscription_id");