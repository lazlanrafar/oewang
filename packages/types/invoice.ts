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
