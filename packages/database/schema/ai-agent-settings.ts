import { createId } from "@paralleldrive/cuid2";
import {
  decimal,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const aiAgentSettings = pgTable("ai_agent_settings", {
  id: text("id").primaryKey().$defaultFn(createId),
  workspace_id: text("workspace_id")
    .references(() => workspaces.id)
    .notNull()
    .unique(),
  model: text("model").default("gpt-4o-mini").notNull(),
  temperature: decimal("temperature", { precision: 3, scale: 2 })
    .default("0.70")
    .notNull(),
  max_steps: integer("max_steps").default(10).notNull(),
  custom_instructions: text("custom_instructions"),
  response_language: text("response_language").default("auto").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type AiAgentSettings = typeof aiAgentSettings.$inferSelect;
export type InsertAiAgentSettings = typeof aiAgentSettings.$inferInsert;
