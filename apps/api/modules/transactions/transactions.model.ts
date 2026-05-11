import { t, type UnwrapSchema } from "elysia";

export const TransactionModel = {
  create: t.Object({
    walletId: t.String(),
    toWalletId: t.Optional(t.String()),
    categoryId: t.Optional(t.String()),
    amount: t.Numeric(),
    date: t.String(),
    type: t.Union([
      t.Literal("income"),
      t.Literal("expense"),
      t.Literal("transfer"),
      t.Literal("transfer-in"),
      t.Literal("transfer-out"),
    ]),
    name: t.Optional(t.Nullable(t.String())),
    description: t.Optional(t.Nullable(t.String())),
    isReady: t.Optional(t.Boolean()),
    isExported: t.Optional(t.Boolean()),
    assignedUserId: t.Optional(t.String()),
    attachmentIds: t.Optional(t.Array(t.String())),
  }),
  bulkCreate: t.Array(
    t.Object({
      walletId: t.String(),
      toWalletId: t.Optional(t.String()),
      categoryId: t.Optional(t.String()),
      amount: t.Numeric(),
      date: t.String(),
      type: t.Union([
        t.Literal("income"),
        t.Literal("expense"),
        t.Literal("transfer"),
        t.Literal("transfer-in"),
        t.Literal("transfer-out"),
      ]),
      name: t.Optional(t.Nullable(t.String())),
      description: t.Optional(t.Nullable(t.String())),
      isReady: t.Optional(t.Boolean()),
      isExported: t.Optional(t.Boolean()),
      assignedUserId: t.Optional(t.String()),
      attachmentIds: t.Optional(t.Array(t.String())),
    }),
  ),
  bulkDelete: t.Object({
    ids: t.Array(t.String()),
  }),
  update: t.Object({
    walletId: t.Optional(t.String()),
    toWalletId: t.Optional(t.String()),
    categoryId: t.Optional(t.String()),
    amount: t.Optional(t.Numeric()),
    date: t.Optional(t.String()),
    type: t.Optional(
      t.Union([
        t.Literal("income"),
        t.Literal("expense"),
        t.Literal("transfer"),
        t.Literal("transfer-in"),
        t.Literal("transfer-out"),
      ]),
    ),
    name: t.Optional(t.Nullable(t.String())),
    description: t.Optional(t.Nullable(t.String())),
    isReady: t.Optional(t.Boolean()),
    isExported: t.Optional(t.Boolean()),
    assignedUserId: t.Optional(t.String()),
    attachmentIds: t.Optional(t.Array(t.String())),
  }),
  listQuery: t.Object({
    page: t.Optional(t.Numeric()),
    limit: t.Optional(t.Numeric()),
    type: t.Optional(
      t.Union([
        t.Literal("income"),
        t.Literal("expense"),
        t.Literal("transfer"),
        t.Literal("transfer-in"),
        t.Literal("transfer-out"),
      ]),
    ),
    walletId: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    categoryId: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    startDate: t.Optional(t.String()),
    endDate: t.Optional(t.String()),
    minAmount: t.Optional(t.Numeric()),
    maxAmount: t.Optional(t.Numeric()),
    hasAttachments: t.Optional(t.Boolean()),
    search: t.Optional(t.String()),
    uncategorized: t.Optional(t.Boolean()),
  }),
  exportQuery: t.Object({
    startDate: t.Optional(t.String()),
    endDate: t.Optional(t.String()),
    allData: t.Optional(t.BooleanString()),
  }),
} as const;

export type CreateTransactionInput = UnwrapSchema<
  typeof TransactionModel.create
>;
export type UpdateTransactionInput = UnwrapSchema<
  typeof TransactionModel.update
>;
export type GetTransactionsQueryInput = UnwrapSchema<
  typeof TransactionModel.listQuery
>;
export type ExportTransactionsQueryInput = UnwrapSchema<
  typeof TransactionModel.exportQuery
>;

