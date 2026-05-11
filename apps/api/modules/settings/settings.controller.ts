import { Elysia } from "elysia";
import { SettingsService } from "./settings.service";
import { SettingsModel } from "./settings.model";
import { subCurrenciesController } from "./sub-currencies/sub-currencies.controller";
import { ratesController } from "./rates/rates.controller";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const settingsController = new Elysia({
  prefix: "/settings",
  name: "settings.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .use(subCurrenciesController)
  .use(ratesController)
  .get(
    "/transaction",
    async ({ auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return SettingsService.getTransactionSettings(auth.workspace_id);
    },
    {
      detail: {
        summary: "Get transaction settings",
        tags: ["Settings"],
      },
    },
  )
  .patch(
    "/transaction",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return SettingsService.updateTransactionSettings(
        auth.workspace_id,
        auth.user_id,
        body,
      );
    },
    {
      body: SettingsModel.transactionSettings,
      detail: {
        summary: "Update transaction settings",
        tags: ["Settings"],
      },
    },
  );
