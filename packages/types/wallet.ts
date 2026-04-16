export interface Wallet {
  id: string;
  workspaceId: string;
  groupId?: string | null;
  name: string;
  currency: string;
  balance: number;
  isIncludedInTotals: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
