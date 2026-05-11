import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(createId),
  email: text("email").notNull().unique(),
  name: text("name"),
  profile_picture: text("profile_picture"),
  mobile: text("mobile"),
  oauth_provider: text("oauth_provider"),
  providers: text("providers").array(),
  workspace_id: text("workspace_id").references(() => workspaces.id),
  system_role: text("system_role", { enum: ["owner", "finance", "user"] })
    .default("user")
    .notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
