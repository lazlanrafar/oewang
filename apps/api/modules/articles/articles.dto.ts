import { t, type UnwrapSchema } from "elysia";

export const CreateArticleDto = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  // Optional — service generates a unique slug from the title when omitted.
  slug: t.Optional(t.String({ maxLength: 255 })),
  excerpt: t.Optional(t.String()),
  content: t.Optional(t.String()),
  cover_image: t.Optional(t.String()),
  published: t.Optional(t.Boolean({ default: false })),
});

export const UpdateArticleDto = t.Partial(CreateArticleDto);

export const UploadArticleImageBody = t.Object({
  file: t.File({ maxSize: "10m", type: "image" }),
});

export const ArticleListQuery = t.Object({
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

export type CreateArticleInput = UnwrapSchema<typeof CreateArticleDto>;
export type UpdateArticleInput = UnwrapSchema<typeof UpdateArticleDto>;
export type ArticleListInput = UnwrapSchema<typeof ArticleListQuery>;
