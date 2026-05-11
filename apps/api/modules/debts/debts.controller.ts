import { Elysia, t } from "elysia";
import { DebtsService } from "./debts.service";
import { DebtsModel } from "./debts.model";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const debtsController = new Elysia({ prefix: "/debts" })
  .use(authPlugin)
  .use(encryptionPlugin)
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
      const data = await DebtsService.getDebts(workspaceId!, query);
      return data;
    },
    {
      query: DebtsModel.listQuery,
      detail: {
        summary: "Get All Debts",
        description: "Returns a paginated list of debts (loans and payables) for the active workspace.",
        tags: ["Debts"],
      },
    },
  )

  // Create a debt
  .post(
    "/",
    async ({ auth, workspaceId, userId, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Create Debt",
        description: "Creates a new debt record (money owed to others or owed by others).",
        tags: ["Debts"],
      },
    },
  )

  // Update a debt
  .patch(
    "/:id",
    async ({ auth, workspaceId, userId, params, body }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Update Debt",
        description: "Updates an existing debt record's terms, amount, or contact details.",
        tags: ["Debts"],
      },
    },
  )

  // Pay a debt
  .post(
    "/:id/pay",
    async ({ auth, workspaceId, userId, params, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Pay Debt",
        description: "Records a payment against a debt. If fully paid, the debt status is updated.",
        tags: ["Debts"],
      },
    },
  )

  // Bulk pay debts
  .post(
    "/bulk-pay",
    async ({ auth, workspaceId, userId, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Bulk Pay Debts",
        description: "Records payments for multiple debts in a single transaction.",
        tags: ["Debts"],
      },
    },
  )

  // Delete a debt
  .delete(
    "/:id",
    async ({ auth, workspaceId, userId, params }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      const data = await DebtsService.deleteDebt(
        workspaceId!,
        userId!,
        params.id,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete Debt",
        description: "Soft-deletes a debt record. Associated payments remain as transactions but the debt relationship is hidden.",
        tags: ["Debts"],
      },
    },
  )
  
  // Split bill
  .post(
    "/split",
    async ({ auth, workspaceId, userId, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Split Bill",
        description: "Creates multiple debt records from a single amount, distributed among multiple contacts.",
        tags: ["Debts"],
      },
    },
  );
