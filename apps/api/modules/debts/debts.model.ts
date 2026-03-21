import { t, type UnwrapSchema } from "elysia";

export const DebtsModel = {
  create: t.Object({
    contactId: t.String(),
    type: t.Union([t.Literal("payable"), t.Literal("receivable")]),
    amount: t.Union([t.String(), t.Number()]),
    description: t.Optional(t.String()),
    dueDate: t.Optional(t.String()),
    sourceTransactionId: t.Optional(t.String()),
  }),
  update: t.Object({
    amount: t.Optional(t.Union([t.String(), t.Number()])),
    description: t.Optional(t.String()),
    dueDate: t.Optional(t.String()),
  }),
  pay: t.Object({
    amount: t.Union([t.String(), t.Number()]),
    walletId: t.Optional(t.String()), // Optional wallet to deduct/add money
  }),
  bulkPay: t.Object({
    payments: t.Array(t.Object({
      id: t.String(),
      amount: t.Union([t.String(), t.Number()]),
    })),
    walletId: t.Optional(t.String()), // Optional wallet to deduct/add money
  }),
  splitBill: t.Object({
    transactionId: t.Optional(t.String()), // if paying an existing tx
    walletId: t.Optional(t.String()),     // if creating a new tx
    categoryId: t.Optional(t.String()),   // if creating a new tx
    name: t.String(),                     // description
    amount: t.Union([t.String(), t.Number()]), // total
    contactNames: t.Array(t.String()),    // names to split with
  }),
} as const;

export type CreateDebtInput = UnwrapSchema<typeof DebtsModel.create>;
export type UpdateDebtInput = UnwrapSchema<typeof DebtsModel.update>;
export type PayDebtInput = UnwrapSchema<typeof DebtsModel.pay>;
export type BulkPayDebtInput = UnwrapSchema<typeof DebtsModel.bulkPay>;
export type SplitBillInput = UnwrapSchema<typeof DebtsModel.splitBill>;
