import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  profile_picture: text("profile_picture"),
  mobile: text("mobile"),
  oauth_provider: text("oauth_provider"),
  providers: text("providers").array(),
  workspace_id: uuid("workspace_id").references(() => workspaces.id),
  system_role: text("system_role", { enum: ["owner", "finance", "user"] })
    .default("user")
    .notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
