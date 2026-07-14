import { t, type UnwrapSchema } from "elysia";

export const CreateFaqDto = t.Object({
  question: t.String({ minLength: 1, maxLength: 500 }),
  answer: t.String({ minLength: 1 }),
  category: t.Optional(t.String()),
  sort_order: t.Optional(t.Number({ default: 0 })),
  published: t.Optional(t.Boolean({ default: true })),
});

export const UpdateFaqDto = t.Partial(CreateFaqDto);

export const FaqListQuery = t.Object({
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
  published: t.Optional(
    t
      .Transform(t.String())
      .Decode((v) => v === "true")
      .Encode((v) => v.toString()),
  ),
});

export type CreateFaqInput = UnwrapSchema<typeof CreateFaqDto>;
export type UpdateFaqInput = UnwrapSchema<typeof UpdateFaqDto>;
export type FaqListInput = UnwrapSchema<typeof FaqListQuery>;
