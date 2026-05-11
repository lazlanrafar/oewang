import { createId } from "@paralleldrive/cuid2";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const audit_logs = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(createId),
  workspace_id: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(), // format: "{entity}.{verb}" e.g. "invoice.deleted"
  entity: text("entity").notNull(),
  entity_id: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  deleted_at: timestamp("deleted_at"),
});
