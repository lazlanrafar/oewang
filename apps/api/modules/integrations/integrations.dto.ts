import { t } from "elysia";

export const TwilioWebhookDto = t.Object(
  {
    Body: t.Optional(t.String()),
    From: t.Optional(t.String()), // e.g. "whatsapp:+123456789"
    NumMedia: t.Optional(t.String()),
    MediaUrl0: t.Optional(t.String()),
    MediaContentType0: t.Optional(t.String()),
  },
  { additionalProperties: true },
);

export const ConnectWhatsAppDto = t.Object({
  phoneNumber: t.String(), // e.g., "+123456789"
});
