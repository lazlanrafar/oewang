import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as users from "./schema/users";
import * as workspaces from "./schema/workspaces";
import * as user_workspaces from "./schema/user-workspaces";
import * as articles from "./schema/articles";
import * as audit_logs from "./schema/audit-logs";
import * as categories from "./schema/categories";
import * as orders from "./schema/orders";

const schema = {
  ...users,
  ...workspaces,
  ...user_workspaces,
  ...articles,
  ...audit_logs,
  ...categories,
  ...orders,
};

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });
