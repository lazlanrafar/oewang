import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const oauth_accounts = pgTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "google" | "github"
    provider_user_id: text("provider_user_id").notNull(),
    provider_email: text("provider_email"),
    provider_name: text("provider_name"),
    provider_avatar: text("provider_avatar"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("oauth_accounts_provider_uid_idx").on(t.provider, t.provider_user_id)],
);
