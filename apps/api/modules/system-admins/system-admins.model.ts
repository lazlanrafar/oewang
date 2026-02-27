import { t } from "elysia";

export const SystemAdminModel = {
  listQuery: t.Object({
    page: t.Optional(t.Numeric({ default: 1 })),
    limit: t.Optional(t.Numeric({ default: 50 })),
    search: t.Optional(t.String()),
    system_role: t.Optional(t.String()),
    sortBy: t.Optional(t.String()),
    sortOrder: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  }),
};
