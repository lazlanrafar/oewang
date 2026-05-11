import { t } from "elysia";

// --- Wallet Groups ---

export const walletGroupSchema = t.Object({
  id: t.String(),
  workspaceId: t.String(),
  name: t.String(),
  sortOrder: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const createWalletGroupBody = t.Object({
  name: t.String({ minLength: 1 }),
});

export const updateWalletGroupBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  sortOrder: t.Optional(t.Integer()),
});

export const reorderWalletGroupsBody = t.Object({
  updates: t.Array(
    t.Object({
      id: t.String(),
      sortOrder: t.Integer(),
    }),
  ),
});

// --- Wallets ---

export const walletSchema = t.Object({
  id: t.String(),
  workspaceId: t.String(),
  groupId: t.Union([t.String(), t.Null()]),
  name: t.String(),
  balance: t.String(), // Decimal returned as string
  isIncludedInTotals: t.Boolean(),
  sortOrder: t.Integer(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const createWalletBody = t.Object({
  name: t.String({ minLength: 1 }),
  groupId: t.Optional(t.Union([t.String(), t.Null()])),
  balance: t.Optional(t.String()), // Input as string "100.00"
  isIncludedInTotals: t.Optional(t.Boolean()),
});

export const updateWalletBody = t.Object({
  name: t.Optional(t.String({ minLength: 1 })),
  groupId: t.Optional(t.Union([t.String(), t.Null()])), // Allow moving to no group
  balance: t.Optional(t.String()),
  isIncludedInTotals: t.Optional(t.Boolean()),
  sortOrder: t.Optional(t.Integer()),
});

export const reorderWalletsBody = t.Object({
  updates: t.Array(
    t.Object({
      id: t.String(),
      sortOrder: t.Integer(),
      groupId: t.Optional(t.Union([t.String(), t.Null()])), // Support moving between groups during reorder?
    }),
  ),
});
