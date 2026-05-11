import { t } from "elysia";

export const PrivacyRequestType = t.Union([
  t.Literal("access"),
  t.Literal("export"),
  t.Literal("restrict"),
  t.Literal("erasure"),
]);

export const PrivacyRequestStatus = t.Union([
  t.Literal("received"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("rejected"),
]);

export const CreatePrivacyRequestBody = t.Object({
  requestType: PrivacyRequestType,
  reason: t.Optional(t.String()),
});

export const RestrictProcessingBody = t.Object({
  reason: t.Optional(t.String()),
});

export const EraseDataBody = t.Object({
  confirmation: t.String(),
});

export const UpdatePrivacyRequestStatusBody = t.Object({
  status: PrivacyRequestStatus,
  note: t.Optional(t.String()),
  closedReason: t.Optional(t.String()),
});

export const PrivacyRequestsQuery = t.Object({
  page: t.Optional(t.Numeric()),
  limit: t.Optional(t.Numeric()),
  status: t.Optional(t.String()),
  userId: t.Optional(t.String()),
  requestType: t.Optional(t.String()),
});
