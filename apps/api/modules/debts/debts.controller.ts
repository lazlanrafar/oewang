import { Elysia, t } from "elysia";
import { DebtsService } from "./debts.service";
import { DebtsModel } from "./debts.model";
import { authPlugin } from "../../plugins/auth";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const debtsController = new Elysia({ prefix: "/debts" })
  .use(authPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
    userId: auth?.user_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })

  // Get all debts
  .get(
    "/",
    async ({ workspaceId, query }) => {
      const data = await DebtsService.getDebts(
        workspaceId!,
        query.contactId,
      );
      return data;
    },
    {
      query: t.Object({
        contactId: t.Optional(t.String()),
      }),
    },
  )

  // Create a debt
  .post(
    "/",
    async ({ workspaceId, userId, body, set }) => {
      const data = await DebtsService.createDebt(
        workspaceId!,
        userId!,
        body,
      );
      set.status = 201;
      return data;
    },
    {
      body: DebtsModel.create,
    },
  )

  // Update a debt
  .patch(
    "/:id",
    async ({ workspaceId, userId, params, body }) => {
      const data = await DebtsService.updateDebt(
        workspaceId!,
        userId!,
        params.id,
        body,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
      body: DebtsModel.update,
    },
  )

  // Pay a debt
  .post(
    "/:id/pay",
    async ({ workspaceId, userId, params, body, set }) => {
      const data = await DebtsService.payDebt(
        workspaceId!,
        userId!,
        params.id,
        body,
      );
      set.status = 201;
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
      body: DebtsModel.pay,
    },
  )

  // Bulk pay debts
  .post(
    "/bulk-pay",
    async ({ workspaceId, userId, body, set }) => {
      const data = await DebtsService.bulkPayDebt(
        workspaceId!,
        userId!,
        body,
      );
      set.status = 201;
      return data;
    },
    {
      body: DebtsModel.bulkPay,
    },
  )

  // Delete a debt
  .delete(
    "/:id",
    async ({ workspaceId, userId, params }) => {
      const data = await DebtsService.deleteDebt(
        workspaceId!,
        userId!,
        params.id,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )
  
  // Split bill
  .post(
    "/split",
    async ({ workspaceId, userId, body, set }) => {
      const data = await DebtsService.splitBill(
        workspaceId!,
        userId!,
        body,
      );
      set.status = 201;
      return data;
    },
    {
      body: DebtsModel.splitBill,
    },
  );
