import { t, type UnwrapSchema } from "elysia";

export const CreatePricingDto = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
  prices: t.Optional(
    t.Array(
      t.Object({
        currency: t.String(),
        monthly: t.Number({ minimum: 0 }),
        yearly: t.Number({ minimum: 0 }),
        xendit_monthly_id: t.Optional(t.String()),
        xendit_yearly_id: t.Optional(t.String()),
        xendit_product_id: t.Optional(t.String()),
      }),
    ),
  ),
  max_vault_size_mb: t.Optional(t.Number({ minimum: 0, default: 100 })),
  max_ai_tokens: t.Optional(t.Number({ minimum: 0, default: 100 })),
  max_workspaces: t.Optional(t.Number({ minimum: 1, default: 1 })),
  features: t.Optional(t.Array(t.String())),
  is_active: t.Optional(t.Boolean({ default: true })),
  is_addon: t.Optional(t.Boolean({ default: false })),
  addon_type: t.Optional(t.Union([t.Literal("ai"), t.Literal("vault")])),
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
  is_addon: t.Optional(
    t
      .Transform(t.String())
      .Decode((v) => v === "true")
      .Encode((v) => v.toString()),
  ),
});

export type CreatePricingInput = UnwrapSchema<typeof CreatePricingDto>;
export type UpdatePricingInput = UnwrapSchema<typeof UpdatePricingDto>;
export type PricingListInput = UnwrapSchema<typeof PricingListQuery>;
