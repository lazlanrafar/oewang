import { t, type UnwrapSchema } from "elysia";

export const CreateCustomerDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  email: t.String({ format: "email" }),
  phone: t.Optional(t.Nullable(t.String({ maxLength: 50 }))),
  website: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  contact: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
  addressLine1: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  addressLine2: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  city: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  state: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  country: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  zip: t.Optional(t.Nullable(t.String({ maxLength: 20 }))),
  note: t.Optional(t.Nullable(t.String())),
  vatNumber: t.Optional(t.Nullable(t.String({ maxLength: 50 }))),
});

export const UpdateCustomerDto = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  email: t.Optional(t.String({ format: "email" })),
  phone: t.Optional(t.Nullable(t.String({ maxLength: 50 }))),
  website: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  contact: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
  addressLine1: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  addressLine2: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  city: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  state: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  country: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  zip: t.Optional(t.Nullable(t.String({ maxLength: 20 }))),
  note: t.Optional(t.Nullable(t.String())),
  vatNumber: t.Optional(t.Nullable(t.String({ maxLength: 50 }))),
});

export const CustomerListQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
  search: t.Optional(t.String()),
});

export type CreateCustomerInput = UnwrapSchema<typeof CreateCustomerDto>;
export type UpdateCustomerInput = UnwrapSchema<typeof UpdateCustomerDto>;
export type CustomerListQueryInput = UnwrapSchema<typeof CustomerListQuery>;
