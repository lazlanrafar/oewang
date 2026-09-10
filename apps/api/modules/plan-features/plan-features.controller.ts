import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { eq, isNull } from "drizzle-orm";
import { Elysia, status, t } from "elysia";
import { db, plan_features } from "@workspace/database";
import { authPlugin } from "../../plugins/auth";

export const planFeaturesController = new Elysia({
  prefix: "/plan-features",
})
  .use(authPlugin)
  .get("/", async () => {
    const items = await db
      .select()
      .from(plan_features)
      .where(isNull(plan_features.deleted_at));
    return buildSuccess(items);
  })
  .post(
    "/",
    async ({ body, auth }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }

      const existing = await db
        .select()
        .from(plan_features)
        .where(eq(plan_features.code, body.code))
        .limit(1);

      if (existing.length > 0) {
        throw status(409, buildError(ErrorCode.CONFLICT, "Feature code already exists"));
      }

      const [item] = await db
        .insert(plan_features)
        .values({
          code: body.code,
          name: body.name,
          description: body.description,
          type: body.type,
          unit: body.unit,
          default_value: body.default_value,
          is_active: body.is_active ?? true,
        })
        .returning();

      return buildSuccess(item, "Plan feature created");
    },
    {
      body: t.Object({
        code: t.String(),
        name: t.String(),
        description: t.Optional(t.String()),
        type: t.Union([t.Literal("boolean"), t.Literal("numeric_limit")]),
        unit: t.Optional(t.String()),
        default_value: t.Optional(t.String()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )
  .patch(
    "/:id",
    async ({ params, body, auth }) => {
      if (!auth?.user_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthenticated"));
      }

      const [updated] = await db
        .update(plan_features)
        .set({
          ...body,
          updated_at: new Date(),
        })
        .where(eq(plan_features.id, params.id))
        .returning();

      return buildSuccess(updated, "Plan feature updated");
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        type: t.Optional(t.Union([t.Literal("boolean"), t.Literal("numeric_limit")])),
        unit: t.Optional(t.String()),
        default_value: t.Optional(t.String()),
        is_active: t.Optional(t.Boolean()),
      }),
    },
  );
