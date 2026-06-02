import type { Pricing } from "./pricing";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type WorkspaceActiveAddon = {
  row_id: string;
  id: string;
  addon_type: "ai" | "vault" | null;
  max_ai_tokens: number;
  max_vault_size_mb: number;
  amount: number;
  qty: number;
  status: "active" | "cancelled";
  created_at: string | Date;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  country?: string | null;
  plan_id?: string | null;
  plan_status: string;
  plan_billing_interval?: "monthly" | "annual" | null;
  mayar_customer_email?: string | null;
  mayar_transaction_id?: string | null;
  plan_started_at?: string | null;
  plan_current_period_end?: string | null;
  plan_overdue_started_at?: string | null;
  plan_last_reminder_at?: string | null;
  storage_violation_at?: string | null;
  ai_tokens_used: number;
  ai_tokens_reset_at: string;
  vault_size_used_bytes: number;
  extra_ai_tokens: number;
  extra_vault_size_mb: number;
  active_addons?: WorkspaceActiveAddon[];
  plan?: Pricing | null;
  current_user_role?: WorkspaceRole | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMembership = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
};

export type WorkspaceWithRole = Workspace & {
  role: WorkspaceRole;
  plan_name?: string | null;
  max_workspaces?: number | null;
  max_ai_tokens?: number | null;
  max_vault_size_mb?: number | null;
};

export type SystemAdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  plan_id?: string | null;
  plan_status: string;
  plan_name?: string | null;
  created_at: string;
  ai_tokens_used: number;
  vault_size_used_bytes: number;
};
