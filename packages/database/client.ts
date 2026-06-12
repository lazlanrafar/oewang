import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as ai_messages from "./schema/ai-messages";
import * as ai_sessions from "./schema/ai-sessions";
import * as articles from "./schema/articles";
import * as audit_logs from "./schema/audit-logs";
import * as categories from "./schema/categories";
import * as contacts from "./schema/contacts";
import * as debt_payments from "./schema/debt-payments";
import * as debts from "./schema/debts";
import * as invoices from "./schema/invoices";
import * as orders from "./schema/orders";
import * as pricing from "./schema/pricing";
import * as privacy_requests from "./schema/privacy-requests";
import * as transaction_attachments from "./schema/transaction-attachments";
import * as transactions from "./schema/transactions";
import * as user_workspaces from "./schema/user-workspaces";
import * as users from "./schema/users";
import * as vault_files from "./schema/vault-files";
import * as wallet_groups from "./schema/wallet-groups";
import * as wallets from "./schema/wallets";
import * as mcp_auth_codes from "./schema/mcp-auth-codes";
import * as mcp_oauth_clients from "./schema/mcp-oauth-clients";
import * as mcp_tokens from "./schema/mcp-tokens";
import * as webhook_events from "./schema/webhook-events";
import * as workspace_integrations from "./schema/workspace-integrations";
import * as workspace_invitations from "./schema/workspace-invitations";
import * as workspace_settings from "./schema/workspace-settings";
import * as workspace_sub_currencies from "./schema/workspace-sub-currencies";
import * as workspaces from "./schema/workspaces";

const schema = {
  ...users,
  ...workspaces,
  ...user_workspaces,
  ...articles,
  ...audit_logs,
  ...categories,
  ...orders,
  ...workspace_settings,
  ...wallets,
  ...wallet_groups,
  ...workspace_sub_currencies,
  ...vault_files,
  ...workspace_invitations,
  ...transactions,
  ...transaction_attachments,
  ...ai_sessions,
  ...ai_messages,
  ...workspace_integrations,
  ...pricing,
  ...privacy_requests,
  ...invoices,
  ...contacts,
  ...debts,
  ...debt_payments,
  ...webhook_events,
  ...mcp_oauth_clients,
  ...mcp_auth_codes,
  ...mcp_tokens,
};

const isDev = process.env.NODE_ENV !== "production";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: parseInt(process.env.DATABASE_POOL_MAX ?? (isDev ? "3" : "10"), 10),
  idle_timeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? "20", 10),
  connect_timeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT ?? "10", 10),
  max_lifetime: 60 * 30, // 30 min — recycles stale connections from hot-reloads
  onnotice: () => {}, // suppress NOTICE logs from migrations
});

export const db = drizzle(client, { schema });
