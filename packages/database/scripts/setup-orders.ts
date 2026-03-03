import { db } from "../client";
import { users, workspaces, orders } from "../index";
import { eq } from "drizzle-orm";

async function setup() {
  console.log("Setting up admin access and mock orders...");

  // 1. Get the first user and workspace
  const userList = await db.select().from(users).limit(1);
  if (!userList.length) {
    console.error("No users found in database to promote.");
    process.exit(1);
  }
  const mainUser = userList[0]!;

  const workspaceList = await db.select().from(workspaces).limit(1);
  if (!workspaceList.length) {
    console.error("No workspaces found.");
    process.exit(1);
  }
  const mainWorkspace = workspaceList[0]!;

  console.log(`Promoting user ${mainUser.email} to System Admin...`);

  // 2. Update user to system_role: 'owner'
  await db
    .update(users)
    .set({ system_role: "owner" })
    .where(eq(users.id, mainUser.id));

  console.log("Admin promotion successful.");

  // 3. Clear existing orders and insert mocks
  console.log("Adding mock orders...");
  await db.delete(orders).execute();

  await db.insert(orders).values([
    {
      workspace_id: mainWorkspace.id,
      user_id: mainUser.id,
      amount: 19900,
      currency: "usd",
      status: "paid",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      workspace_id: mainWorkspace.id,
      user_id: mainUser.id,
      amount: 49900,
      currency: "eur",
      status: "pending",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
    {
      workspace_id: mainWorkspace.id,
      user_id: mainUser.id,
      amount: 9900,
      currency: "usd",
      status: "paid",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
  ]);

  console.log("Mock orders added successfuly.");
}

setup().catch(console.error);
