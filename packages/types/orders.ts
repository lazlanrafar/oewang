export interface Order {
  id: string;
  code: string;
  workspace_id: string | null;
  user_id: string | null;
  xendit_payment_id: string | null;
  xendit_invoice_id: string | null;
  xendit_subscription_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdminOrderListing {
  id: string;
  code: string;
  amount: number;
  currency: string;
  status: string;
  created_at: Date | string;
  workspaceName: string | null;
  userName: string | null;
  userEmail: string | null;
  xendit_payment_id: string | null;
  xendit_invoice_id: string | null;
  xendit_subscription_id: string | null;
}
