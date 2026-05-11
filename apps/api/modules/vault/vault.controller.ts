import { Elysia, t } from "elysia";
import { VaultService } from "./vault.service";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildPaginatedSuccess, buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { logger } from "@workspace/logger";
import {
  uploadFileBody,
  updateTagsBody,
  getVaultFilesQuery,
} from "./vault.dto";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const vaultController = new Elysia({ prefix: "/vault" })
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
  .get(
    "/",
    async ({ workspaceId, query }) => {
      const { files, pagination } = await VaultService.listFiles(
        workspaceId!,
        query,
      );
      return buildPaginatedSuccess(files, pagination, "Files retrieved");
    },
    {
      query: getVaultFilesQuery,
      detail: {
        summary: "List Vault Files",
        description: "Returns a paginated list of files stored in the workspace vault.",
        tags: ["Vault"],
      },
    },
  )
  .post(
    "/upload",
    async ({ auth, workspaceId, userId, body: { file }, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const data = await VaultService.uploadFile(workspaceId!, userId!, {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer,
        });
        set.status = 201;
        return buildSuccess(data, "File uploaded successfully");
      } catch (error: any) {
        logger.error("Error uploading file to vault", { error, workspaceId });

        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      body: uploadFileBody,
      detail: {
        summary: "Upload File",
        description: "Uploads a new file to the workspace vault.",
        tags: ["Vault"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ auth, workspaceId, userId, params: { id } }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      const data = await VaultService.deleteFile(workspaceId!, userId!, id);
      return buildSuccess(data, "File deleted successfully");
    },
    {
      detail: {
        summary: "Delete File",
        description: "Permanently deletes a file from the vault and associated storage.",
        tags: ["Vault"],
      },
    },
  )
  .get(
    "/:id/download",
    async ({ workspaceId, params: { id } }) => {
      const url = await VaultService.getDownloadUrl(workspaceId!, id);
      return buildSuccess({ url }, "Download URL generated");
    },
    {
      detail: {
        summary: "Get Download URL",
        description: "Generates a temporary signed URL for downloading a file from the vault.",
        tags: ["Vault"],
      },
    },
  )
  .patch(
    "/:id/tags",
    async ({ auth, workspaceId, userId, params: { id }, body: { tags } }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      const data = await VaultService.updateTags(workspaceId!, userId!, id, tags);
      return buildSuccess(data, "Tags updated successfully");
    },
    {
      body: updateTagsBody,
      detail: {
        summary: "Update File Tags",
        description: "Updates the organizational tags associated with a specific file.",
        tags: ["Vault"],
      },
    },
  );
