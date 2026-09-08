import { t, type UnwrapSchema } from "elysia";

export const TransactionModel = {
  create: t.Object({
    // Client-generated CUID2 (offline-first mobile sync). Omitted by web/CSV
    // callers, which keep getting a server-generated id as before. When
    // present, a retried sync with the same id is idempotent (see
    // TransactionsRepository.createIdempotent).
    id: t.Optional(t.String()),
    walletId: t.String(),
    toWalletId: t.Optional(t.String()),
    categoryId: t.Optional(t.String()),
    amount: t.Numeric(),
    originalAmount: t.Optional(t.Nullable(t.Numeric())),
    originalCurrencyCode: t.Optional(t.Nullable(t.String())),
    exchangeRate: t.Optional(t.Nullable(t.Numeric())),
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
  // Bulk import (CSV/Excel) rows can carry malformed values (bad date, an
  // unmapped type string, a non-numeric amount) for a handful of rows out
  // of hundreds. Row shape is intentionally loose here — `amount`/`type`
  // are validated per-row in TransactionsService.bulkCreate, which reports
  // clear, row-specific reasons instead of rejecting the whole batch on a
  // single bad row (see docs/FEATURES.md CSV import).
  bulkCreate: t.Array(
    t.Object({
      // Same client-generated CUID2 as `create` — used by the mobile offline
      // sync flush; omitted (and irrelevant to dedup) for CSV/Excel import.
      id: t.Optional(t.String()),
      walletId: t.String(),
      toWalletId: t.Optional(t.String()),
      categoryId: t.Optional(t.String()),
      amount: t.String(),
      originalAmount: t.Optional(t.Nullable(t.Numeric())),
      originalCurrencyCode: t.Optional(t.Nullable(t.String())),
      exchangeRate: t.Optional(t.Nullable(t.Numeric())),
      date: t.String(),
      type: t.String(),
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
    originalAmount: t.Optional(t.Nullable(t.Numeric())),
    originalCurrencyCode: t.Optional(t.Nullable(t.String())),
    exchangeRate: t.Optional(t.Nullable(t.Numeric())),
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
    page: t.Optional(t.Numeric({ minimum: 1 })),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
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
export type BulkCreateTransactionInput = UnwrapSchema<
  typeof TransactionModel.bulkCreate
>[number];

// Same loose row shape as bulkCreate — the AI-review stage runs on the
// exact array the client will later post to /transactions/bulk.
const ReviewRow = t.Object({
  walletId: t.String(),
  toWalletId: t.Optional(t.String()),
  categoryId: t.Optional(t.String()),
  amount: t.String(),
  date: t.String(),
  type: t.String(),
  name: t.Optional(t.Nullable(t.String())),
  description: t.Optional(t.Nullable(t.String())),
});

export const TransactionReviewModel = {
  duplicatesCheck: t.Object({ rows: t.Array(ReviewRow) }),
  categorize: t.Object({ rows: t.Array(ReviewRow) }),
  anomalies: t.Object({ rows: t.Array(ReviewRow) }),
} as const;

export type ReviewRowInput = UnwrapSchema<
  typeof TransactionReviewModel.duplicatesCheck
>["rows"][number];
export type UpdateTransactionInput = UnwrapSchema<
  typeof TransactionModel.update
>;
export type GetTransactionsQueryInput = UnwrapSchema<
  typeof TransactionModel.listQuery
>;
export type ExportTransactionsQueryInput = UnwrapSchema<
  typeof TransactionModel.exportQuery
>;
