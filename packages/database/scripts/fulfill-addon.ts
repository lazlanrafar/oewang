import * as dotenv from "dotenv";
import * as path from "path";
import postgres from "postgres";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

async function fulfillAddon() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not found");
    return;
  }

  const sql = postgres(url);
  
  // From debug output
  const workspaceId = "0cc11537-62d9-45fb-95b4-88910934c338";
  const addonId = "fe48fede-6f33-4e82-9bc8-743b11573b75"; // AI 1M Pack
  const amount = 1000000;
  
  console.log(`Fulfilling AI 1M Pack for workspace ${workspaceId}...`);

  try {
    // Check if already exists
    const existing = await sql`
      SELECT id FROM workspace_addons 
      WHERE workspace_id = ${workspaceId} 
      AND addon_id = ${addonId} 
      AND status = 'active'
    `;

    if (existing.length > 0) {
      console.log("Add-on already active for this workspace.");
    } else {
      await sql`
        INSERT INTO workspace_addons (
          id, 
          workspace_id, 
          addon_id, 
          amount, 
          status, 
          xendit_subscription_id
        ) VALUES (
          gen_random_uuid(),
          ${workspaceId},
          ${addonId},
          ${amount},
          'active',
          'manual_fulfillment'
        )
      `;
      console.log("Successfully fulfilled add-on.");
    }

    // Also add a notification record if table exists
    try {
        await sql`
          INSERT INTO notifications (
            id,
            workspace_id,
            user_id,
            title,
            message,
            type,
            status
          ) VALUES (
            gen_random_uuid(),
            ${workspaceId},
            (SELECT user_id FROM user_workspaces WHERE workspace_id = ${workspaceId} AND role = 'owner' LIMIT 1),
            'Add-on Activated',
            'Your AI 1M Pack has been successfully activated.',
            'info',
            'unread'
          )
        `;
        console.log("Notification sent.");
    } catch (e) {
        console.log("Notifications table not found or error, skipping.");
    }

  } catch (error) {
    console.error("Error during fulfillment:", error);
  } finally {
    await sql.end();
  }
}

fulfillAddon();
