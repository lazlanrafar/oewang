import { createId } from "@paralleldrive/cuid2";
import { pgTable, timestamp, text } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { transactions } from "./transactions";
import { vaultFiles } from "./vault-files";

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
