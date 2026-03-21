ALTER TABLE "customers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "customers" CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" RENAME COLUMN "customer_id" TO "contact_id";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "zip" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "billing_emails" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;