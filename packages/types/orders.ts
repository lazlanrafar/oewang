export interface Order {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdminOrderListing {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: Date | string;
  workspaceName: string | null;
  userName: string | null;
  userEmail: string | null;
}
