export interface Pricing {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  price_one_time: number | null;
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
  currency?: string;
  features?: string[];
  is_active?: boolean;
}

export type UpdatePricingInput = Partial<CreatePricingInput>;
