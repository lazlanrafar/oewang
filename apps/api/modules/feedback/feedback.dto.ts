import { t, type UnwrapSchema } from "elysia";

const FeedbackTypeSchema = t.Union([
  t.Literal("bug"),
  t.Literal("feature_request"),
  t.Literal("other"),
]);

const FeedbackStatusSchema = t.Union([
  t.Literal("new"),
  t.Literal("in_review"),
  t.Literal("planned"),
  t.Literal("resolved"),
  t.Literal("rejected"),
]);

// Public (anonymous, website) submission — email required, name optional.
export const CreatePublicFeedbackBody = t.Object({
  type: FeedbackTypeSchema,
  message: t.String({ minLength: 1, maxLength: 5000 }),
  email: t.String({ format: "email" }),
  name: t.Optional(t.String({ maxLength: 255 })),
  file: t.Optional(t.File({ maxSize: "10m", type: "image" })),
});

// Authenticated (native) submission — identity comes from the JWT.
export const CreateAuthedFeedbackBody = t.Object({
  type: FeedbackTypeSchema,
  message: t.String({ minLength: 1, maxLength: 5000 }),
  file: t.Optional(t.File({ maxSize: "10m", type: "image" })),
});

export const UpdateFeedbackStatusBody = t.Object({
  status: FeedbackStatusSchema,
  admin_note: t.Optional(t.String({ maxLength: 2000 })),
});

export const FeedbackListQuery = t.Object({
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
  status: t.Optional(t.String()),
  type: t.Optional(t.String()),
  source: t.Optional(t.String()),
  sortBy: t.Optional(t.String()),
  sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

export type CreatePublicFeedbackInput = UnwrapSchema<
  typeof CreatePublicFeedbackBody
>;
export type CreateAuthedFeedbackInput = UnwrapSchema<
  typeof CreateAuthedFeedbackBody
>;
export type UpdateFeedbackStatusInput = UnwrapSchema<
  typeof UpdateFeedbackStatusBody
>;
export type FeedbackListInput = UnwrapSchema<typeof FeedbackListQuery>;
