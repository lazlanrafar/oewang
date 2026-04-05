import { t } from "elysia";

export const CreateXenditCheckoutDto = t.Object({
  priceId: t.Optional(t.String()),
  workspaceId: t.Optional(t.String()),
  returnPath: t.Optional(t.String()),
  type: t.Optional(t.Enum({ subscription: "subscription", payment: "payment" })),
  addonType: t.Optional(t.Enum({ ai: "ai", vault: "vault" })),
  amount: t.Optional(t.Number()),
  addonId: t.Optional(t.String()),
});

export const XenditWebhookDto = t.Any();
