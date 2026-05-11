import { Elysia, t, status } from "elysia";
import { BudgetsService } from "./budgets.service";
import { BudgetModel } from "./budgets.model";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const budgets = new Elysia({
  prefix: "/budgets",
  name: "budgets.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/status",
    async ({ auth, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return BudgetsService.getStatus(auth.workspace_id, query.month, query.year);
    },
    {
      query: BudgetModel.statusQuery,
      detail: {
        summary: "Get budget status",
        description: "Returns the spent vs budget status for all categories in the active workspace for a given month and year.",
        tags: ["Budgets"],
      },
    }
  )
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return BudgetsService.create(body, auth.workspace_id, auth.user_id);
    },
    {
      body: BudgetModel.create,
      detail: {
        summary: "Create budget",
        description: "Creates a new recurring monthly budget for a specific expense category.",
        tags: ["Budgets"],
      },
    }
  )
  .put(
    "/:id",
    async ({ auth, params: { id }, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return BudgetsService.update(id, body, auth.workspace_id, auth.user_id);
    },
    {
      body: BudgetModel.update,
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Update budget",
        description: "Updates the monthly amount for an existing budget.",
        tags: ["Budgets"],
      },
    }
  )
  .delete(
    "/:id",
    async ({ auth, params: { id } }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return BudgetsService.delete(id, auth.workspace_id, auth.user_id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete budget",
        description: "Deletes a budget record.",
        tags: ["Budgets"],
      },
    }
  );
