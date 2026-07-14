import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { transactions } from "./transactions";
import { vaultFiles } from "./vault-files";
import { workspaces } from "./workspaces";

export const transactionAttachments = pgTable("transaction_attachments", {
  id: text("id").$defaultFn(createId).primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  vaultFileId: text("vault_file_id")
    .notNull()
    .references(() => vaultFiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});
