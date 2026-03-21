import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as users from "./schema/users";
import * as workspaces from "./schema/workspaces";
import * as user_workspaces from "./schema/user-workspaces";
import * as articles from "./schema/articles";
import * as audit_logs from "./schema/audit-logs";
import * as categories from "./schema/categories";
import * as orders from "./schema/orders";
import * as workspace_settings from "./schema/workspace-settings";
import * as wallets from "./schema/wallets";
import * as wallet_groups from "./schema/wallet-groups";
import * as workspace_sub_currencies from "./schema/workspace-sub-currencies";
import * as vault_files from "./schema/vault-files";
import * as workspace_invitations from "./schema/workspace-invitations";
import * as transactions from "./schema/transactions";
import * as transaction_attachments from "./schema/transaction-attachments";
import * as ai_sessions from "./schema/ai-sessions";
import * as ai_messages from "./schema/ai-messages";
import * as workspace_integrations from "./schema/workspace-integrations";
import * as pricing from "./schema/pricing";
import * as invoices from "./schema/invoices";
import * as contacts from "./schema/contacts";
import * as debts from "./schema/debts";
import * as debt_payments from "./schema/debt-payments";

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
  ...invoices,
  ...contacts,
  ...debts,
  ...debt_payments,
};

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });
