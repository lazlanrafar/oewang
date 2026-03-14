
import { db } from "/Users/boneconsulting/Developer/okane/packages/database";
import { users, workspaceIntegrations } from "/Users/boneconsulting/Developer/okane/packages/database/schema";
import { eq } from "drizzle-orm";

async function check() {
  const workspaceId = "b45ad588-6758-43a4-8c26-1d80f3b0ab9f";
  
  console.log("--- Users ---");
  const workspaceUsers = await db.select().from(users).where(eq(users.workspaceId, workspaceId));
  console.log(JSON.stringify(workspaceUsers.map(u => ({ id: u.id, name: u.name, email: u.email })), null, 2));

  console.log("\n--- Integrations ---");
  const integrations = await db.select().from(workspaceIntegrations).where(eq(workspaceIntegrations.workspaceId, workspaceId));
  console.log(JSON.stringify(integrations, null, 2));
}

check().catch(console.error);
