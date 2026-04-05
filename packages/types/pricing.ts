export interface Pricing {
  id: string;
  name: string;
  description: string | null;
  prices: {
    currency: string;
    monthly: number;
    yearly: number;
    xendit_monthly_id?: string;
    xendit_yearly_id?: string;
    xendit_product_id?: string;
  }[];
  xendit_product_id: string | null;
  max_vault_size_mb: number;
  max_ai_tokens: number;
  max_workspaces: number;
  features: string[];
  is_active: boolean;
  is_addon: boolean;
  addon_type: "ai" | "vault" | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePricingInput {
  name: string;
  description?: string;
  prices?: {
    currency: string;
    monthly: number;
    yearly: number;
    xendit_monthly_id?: string;
    xendit_yearly_id?: string;
    xendit_product_id?: string;
  }[];
  xendit_product_id?: string;
  max_vault_size_mb?: number;
  max_ai_tokens?: number;
  max_workspaces?: number;
  features?: string[];
  is_active?: boolean;
}

export type UpdatePricingInput = Partial<CreatePricingInput>;

export type SystemAdminPlan = {
  id: string;
  name: string;
  is_active: boolean;
};
