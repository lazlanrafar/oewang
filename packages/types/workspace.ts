import type { Pricing } from "./pricing";

export type WorkspaceRole = "owner" | "admin" | "member";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  country?: string | null;
  plan_id?: string | null;
  plan_status: string;
  xendit_customer_id?: string | null;
  xendit_subscription_id?: string | null;
  xendit_current_period_end?: string | null;
  ai_tokens_used: number;
  vault_size_used_bytes: number;
  extra_ai_tokens: number;
  extra_vault_size_mb: number;
  active_addons?: (Pricing & { xendit_subscription_id: string })[];
  plan?: Pricing | null;
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

