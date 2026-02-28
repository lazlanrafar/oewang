export interface Pricing {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  price_one_time: number | null;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  stripe_price_id_one_time: string | null;
  max_vault_size_mb: number;
  max_ai_tokens: number;
  currency: string;
  features: string[];
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePricingInput {
  name: string;
  description?: string;
  price_monthly?: number;
  price_yearly?: number;
  price_one_time?: number;
  stripe_product_id?: string;
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  stripe_price_id_one_time?: string;
  max_vault_size_mb?: number;
  max_ai_tokens?: number;
  currency?: string;
  features?: string[];
  is_active?: boolean;
}

export type UpdatePricingInput = Partial<CreatePricingInput>;
