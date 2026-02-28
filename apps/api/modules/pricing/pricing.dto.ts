import { t, type UnwrapSchema } from "elysia";

export const CreatePricingDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
  price_monthly: t.Optional(t.Number({ minimum: 0 })),
  price_yearly: t.Optional(t.Number({ minimum: 0 })),
  price_one_time: t.Optional(t.Number({ minimum: 0 })),
  currency: t.Optional(t.String({ default: "usd" })),
  features: t.Optional(t.Array(t.String())),
  is_active: t.Optional(t.Boolean({ default: true })),
});

export const UpdatePricingDto = t.Partial(CreatePricingDto);

export const PricingListQuery = t.Object({
  page: t.Optional(
    t
      .Transform(t.String())
      .Decode((v) => parseInt(v, 10))
      .Encode((v) => v.toString()),
  ),
  limit: t.Optional(
    t
      .Transform(t.String())
      .Decode((v) => parseInt(v, 10))
      .Encode((v) => v.toString()),
  ),
  search: t.Optional(t.String()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  is_active: t.Optional(
    t
      .Transform(t.String())
      .Decode((v) => v === "true")
      .Encode((v) => v.toString()),
  ),
});

export type CreatePricingInput = UnwrapSchema<typeof CreatePricingDto>;
export type UpdatePricingInput = UnwrapSchema<typeof UpdatePricingDto>;
export type PricingListInput = UnwrapSchema<typeof PricingListQuery>;
