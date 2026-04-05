import { t, type UnwrapSchema } from "elysia";

export const TransactionItemDto = {
  create: t.Object({
    name: t.String({ minLength: 1 }),
    brand: t.Optional(t.Nullable(t.String())),
    quantity: t.Optional(t.Nullable(t.Numeric())),
    unit: t.Optional(t.Nullable(t.String())),
    unitPrice: t.Optional(t.Nullable(t.Numeric())),
    amount: t.Numeric(),
    categoryId: t.Optional(t.Nullable(t.String())),
    notes: t.Optional(t.Nullable(t.String())),
  }),
  bulkCreate: t.Array(
    t.Object({
      name: t.String({ minLength: 1 }),
      brand: t.Optional(t.Nullable(t.String())),
      quantity: t.Optional(t.Nullable(t.Numeric())),
      unit: t.Optional(t.Nullable(t.String())),
      unitPrice: t.Optional(t.Nullable(t.Numeric())),
      amount: t.Numeric(),
      categoryId: t.Optional(t.Nullable(t.String())),
      notes: t.Optional(t.Nullable(t.String())),
    }),
  ),
  listQuery: t.Object({
    page: t.Optional(t.Numeric()),
    limit: t.Optional(t.Numeric()),
  }),
} as const;

export type CreateTransactionItemInput = UnwrapSchema<
  typeof TransactionItemDto.create
>;
export type BulkCreateTransactionItemsInput = UnwrapSchema<
  typeof TransactionItemDto.bulkCreate
>;
export type TransactionItemsListQuery = UnwrapSchema<
  typeof TransactionItemDto.listQuery
>;
