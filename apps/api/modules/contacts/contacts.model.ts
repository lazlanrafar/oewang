import { t, type UnwrapSchema } from "elysia";

export const ContactsModel = {
  create: t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    email: t.Optional(t.String()),
    phone: t.Optional(t.String()),
    addressLine1: t.Optional(t.String()),
    addressLine2: t.Optional(t.String()),
    city: t.Optional(t.String()),
    state: t.Optional(t.String()),
    country: t.Optional(t.String()),
    zip: t.Optional(t.String()),
    website: t.Optional(t.String()),
    note: t.Optional(t.String()),
    vatNumber: t.Optional(t.String()),
    billingEmails: t.Optional(t.String()),
  }),
  update: t.Object({
    name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
    email: t.Optional(t.String()),
    phone: t.Optional(t.String()),
    addressLine1: t.Optional(t.String()),
    addressLine2: t.Optional(t.String()),
    city: t.Optional(t.String()),
    state: t.Optional(t.String()),
    country: t.Optional(t.String()),
    zip: t.Optional(t.String()),
    website: t.Optional(t.String()),
    note: t.Optional(t.String()),
    vatNumber: t.Optional(t.String()),
    billingEmails: t.Optional(t.String()),
  }),
} as const;

export type CreateContactInput = UnwrapSchema<typeof ContactsModel.create>;
export type UpdateContactInput = UnwrapSchema<typeof ContactsModel.update>;
