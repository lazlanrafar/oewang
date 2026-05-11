import { Elysia, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { encryptionPlugin } from "../../../plugins/encryption";
import { SubCurrenciesService } from "./sub-currencies.service";
import { SubCurrenciesModel } from "./sub-currencies.model";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { assertCanEditWorkspaceData } from "../../workspaces/workspace-permissions";

export const subCurrenciesController = new Elysia({
  prefix: "/sub-currencies",
  name: "subCurrencies.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return SubCurrenciesService.list(auth.workspace_id);
    },
    {
      detail: {
        summary: "List sub-currencies",
        tags: ["Settings", "Sub-Currencies"],
      },
    },
  )
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return SubCurrenciesService.create(auth.workspace_id, auth.user_id, body);
    },
    {
      body: SubCurrenciesModel.create,
      detail: {
        summary: "Create sub-currency",
        tags: ["Settings", "Sub-Currencies"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ auth, params }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return SubCurrenciesService.delete(
        auth.workspace_id,
        auth.user_id,
        params.id,
      );
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete sub-currency",
        tags: ["Settings", "Sub-Currencies"],
      },
    },
  );
