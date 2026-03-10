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
}
