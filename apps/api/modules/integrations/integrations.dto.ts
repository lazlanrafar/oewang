import { t } from "elysia";

export const EvolutionWebhookDto = t.Object(
  {
    event: t.Optional(t.String()),
    instance: t.Optional(t.String()),
    data: t.Optional(t.Any()),
  },
  { additionalProperties: true },
);

export const ConnectWhatsAppDto = t.Object({
  phoneNumber: t.String(), // e.g., "+123456789"
});
