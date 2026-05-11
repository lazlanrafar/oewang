import { t } from "elysia";

/**
 * TypeBox schemas for workspaces module input validation.
 */
export const CreateWorkspaceBody = t.Object({
  name: t.String({ minLength: 1 }),
  country: t.Optional(t.String()),
  mainCurrencyCode: t.Optional(t.String()),
  mainCurrencySymbol: t.Optional(t.String()),
});

export const CreateInvitationBody = t.Object({
  email: t.String({ format: "email" }),
  role: t.Union([
    t.Literal("admin"),
    t.Literal("editor"),
    t.Literal("viewer"),
  ]),
});

export const InvitationParams = t.Object({
  id: t.String(),
  invitationId: t.String(),
});
