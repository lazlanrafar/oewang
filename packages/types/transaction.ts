export interface TransactionItem {
  id: string;
  workspaceId: string;
  transactionId: string;
  name: string;
  brand?: string | null;
  quantity?: string | null;
  unit?: string | null;
  unitPrice?: string | null;
  amount: string;
  categoryId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  category?: { id: string; name: string } | null;
}

export interface Transaction {
  id: string;
  workspaceId: string;
  walletId: string;
  toWalletId?: string | null;
  categoryId?: string | null;
  amount: string; // Decimal is string in JS
  date: string;
  type: string; // 'income' | 'expense' | 'transfer' | 'transfer-in' | 'transfer-out'
  name?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  isReady: boolean;
  isExported: boolean;
  assignedUserId?: string | null;
  deletedAt?: string | null;
  attachmentIds?: string[];
  attachments?: {
    id: string;
    name: string;
    size: number;
    type: string;
  }[];
  wallet?: { id: string; name: string };
  toWallet?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  user?: {
    id: string;
    name: string | null;
    email: string;
    profile_picture: string | null;
  } | null;
  items?: TransactionItem[];
}

export type TransactionQueryParams = {
  page?: number;
  limit?: number;
  type?: string | string[];
  walletId?: string | string[];
  categoryId?: string | string[];
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  hasAttachments?: boolean;
  search?: string;
  uncategorized?: boolean;
};

export type TransactionImportValueMappings = {
  categories: Record<string, string>;
  wallets: Record<string, string>;
  types: Record<string, string>;
};
