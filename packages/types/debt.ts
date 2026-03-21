export interface Debt {
  id: string;
  workspaceId: string;
  contactId: string;
  sourceTransactionId: string | null;
  type: "payable" | "receivable";
  origin: "manual" | "from_transaction";
  amount: string | number;
  remainingAmount: string | number;
  status: "unpaid" | "partial" | "paid";
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DebtPayment {
  id: string;
  workspaceId: string;
  debtId: string;
  transactionId: string | null;
  amount: string | number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
