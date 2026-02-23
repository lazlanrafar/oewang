CREATE TABLE "transaction_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"vault_file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachments" ADD CONSTRAINT "transaction_attachments_vault_file_id_vault_files_id_fk" FOREIGN KEY ("vault_file_id") REFERENCES "public"."vault_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "note";