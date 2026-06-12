import { t, type UnwrapSchema } from "elysia";

export const NotificationDto = {
  listQuery: t.Object({
    page: t.Optional(t.Numeric({ minimum: 1 })),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
  }),
  markRead: t.Object({
    ids: t.Array(t.String()),
  }),
};

export type NotificationListQuery = UnwrapSchema<
  typeof NotificationDto.listQuery
>;
export type MarkReadInput = UnwrapSchema<typeof NotificationDto.markRead>;

export const NotificationSettingDto = {
  update: t.Object({
    email_enabled: t.Optional(t.Boolean()),
    whatsapp_enabled: t.Optional(t.Boolean()),
    push_enabled: t.Optional(t.Boolean()),
    marketing_enabled: t.Optional(t.Boolean()),
    transactions_enabled: t.Optional(t.Boolean()),
    budgets_enabled: t.Optional(t.Boolean()),
    debts_enabled: t.Optional(t.Boolean()),
    invoices_enabled: t.Optional(t.Boolean()),
    wallets_enabled: t.Optional(t.Boolean()),
    workspace_enabled: t.Optional(t.Boolean()),
    inbox_enabled: t.Optional(t.Boolean()),
    ai_enabled: t.Optional(t.Boolean()),
  }),
};

export type UpdateNotificationSettingInput = UnwrapSchema<
  typeof NotificationSettingDto.update
>;
