import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhook_events = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  processed_at: timestamp("processed_at").defaultNow().notNull(),
});
