export type BillingInvoiceLineItem = {
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  meta?: Record<string, unknown>;
};

export type BillingInvoice = {
  id: string;
  workspaceId: string;
  orderId: string | null;
  invoiceNumber: string;
  sequence: number;
  planId: string | null;
  billingInterval: "monthly" | "annual" | null;
  periodStart: string | null;
  periodEnd: string | null;
  kind: "subscription" | "addon" | "one_time";
  lineItems: BillingInvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  billingEmail: string | null;
  workspaceName: string | null;
  mayarTransactionId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
