import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { transactions } from "./transactions";
import { vaultFiles } from "./vault-files";

export const transactionAttachments = pgTable("transaction_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  vaultFileId: uuid("vault_file_id")
    .notNull()
    .references(() => vaultFiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
