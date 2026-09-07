import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

// Tracks one enqueued POST /transactions/import request end-to-end: the
// worker (apps/worker/internal/tasks/transactions_import.go) owns the
// pending -> succeeded/failed transition, writing imported/skipped counts
// (or an error) when it finishes. apps/api only creates the row (status
// "pending") at enqueue time and reads it back for the polling endpoint —
// it never updates it itself, matching the direct-Postgres-write pattern
// apps/ai and apps/worker both already use for other tables.
export const transactionImportJobs = pgTable(
  "transaction_import_jobs",
  {
    id: text("id").$defaultFn(createId).primaryKey().notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "succeeded", "failed"],
    })
      .notNull()
      .default("pending"),
    imported: integer("imported"),
    skipped: integer("skipped"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Polling lookup: one job by id, scoped to the requesting workspace.
    index("transaction_import_jobs_workspace_idx").on(t.workspaceId, t.id),
  ],
);

export type TransactionImportJob = typeof transactionImportJobs.$inferSelect;
export type NewTransactionImportJob = typeof transactionImportJobs.$inferInsert;
