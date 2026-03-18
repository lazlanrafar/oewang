export interface Pricing {
  id: string;
  name: string;
  description: string | null;
  prices: {
    currency: string;
    monthly: number;
    yearly: number;
    stripe_monthly_id?: string;
    stripe_yearly_id?: string;
  }[];
  stripe_product_id: string | null;
  max_vault_size_mb: number;
  max_ai_tokens: number;
  features: string[];
  is_active: boolean;
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
    stripe_monthly_id?: string;
    stripe_yearly_id?: string;
  }[];
  stripe_product_id?: string;
  features?: string[];
  is_active?: boolean;
}

export type UpdatePricingInput = Partial<CreatePricingInput>;
