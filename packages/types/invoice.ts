export interface InvoiceLineItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  contactId: string;
  invoiceNumber: string;
  status: "draft" | "unpaid" | "paid" | "overdue" | "canceled";
  issueDate: string | null;
  dueDate: string | null;
  amount: number;
  vat: number;
  tax: number;
  currency: string;
  internalNote: string | null;
  noteDetails: string | null;
  paymentDetails: string | null;
  logoUrl: string | null;
  lineItems: InvoiceLineItem[];
  isPublic: boolean;
  accessCode: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface InvoiceActivityItem {
  id: string;
  action: string;
  created_at: string;
  before?: Record<string, string | number | boolean | null>;
  after?: Record<string, string | number | boolean | null>;
  user: { name?: string | null; email?: string | null };
}

export interface PublicInvoiceData {
  invoice?: Invoice & {
    contact?: { name?: string | null; email?: string | null } | null;
  };
  invoiceNumber?: string;
  needsCode?: boolean;
  contact?: { name?: string | null; email?: string | null } | null;
  workspace?: { name?: string | null; logoUrl?: string | null } | null;
  settings?: { invoiceLogoUrl?: string | null } | null;
  dictionary?: Record<string, string | number | boolean | null | object>;
}

export type InvoiceStatus = Invoice["status"];

export interface InvoiceCreateData {
  contactId: string;
  invoiceNumber: string;
  issueDate?: string;
  dueDate?: string;
  amount: number;
  vat?: number;
  tax?: number;
  currency: string;
  internalNote?: string;
  noteDetails?: string;
  paymentDetails?: string;
  logoUrl?: string;
  lineItems: Array<{ name: string; quantity: number; price: number }>;
  isPublic?: boolean;
  accessCode?: string;
}

export type InvoiceUpdateData = Partial<
  Omit<
    InvoiceCreateData,
    | "issueDate"
    | "dueDate"
    | "internalNote"
    | "noteDetails"
    | "paymentDetails"
    | "logoUrl"
    | "accessCode"
  >
> & {
  status?: InvoiceStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  internalNote?: string | null;
  noteDetails?: string | null;
  paymentDetails?: string | null;
  logoUrl?: string | null;
  accessCode?: string | null;
};
