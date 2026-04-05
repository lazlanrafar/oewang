CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"quantity" numeric(10, 3),
	"unit" text,
	"unit_price" numeric(19, 4),
	"amount" numeric(19, 4) NOT NULL,
	"category_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_items_workspace_id_idx" ON "transaction_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items" USING btree ("transaction_id");