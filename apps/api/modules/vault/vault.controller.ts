import { Elysia, t } from "elysia";
import { vaultService } from "./vault.service";
import { authPlugin } from "../../plugins/auth";
import {
  buildPaginatedSuccess,
  buildSuccess,
  buildError,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import {
  uploadFileBody,
  updateTagsBody,
  getVaultFilesQuery,
} from "./vault.dto";

export const vaultController = new Elysia({ prefix: "/vault" })
  .use(authPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
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
      const { files, pagination } = await vaultService.listFiles(
        workspaceId!,
        query,
      );
      return buildPaginatedSuccess(files, pagination, "Files retrieved");
    },
    {
      query: getVaultFilesQuery,
      detail: { summary: "List Vault Files", tags: ["Vault"] },
    },
  )
  .post(
    "/upload",
    async ({ workspaceId, body: { file }, set }) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const data = await vaultService.uploadFile(workspaceId!, {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer,
        });
        set.status = 201;
        return buildSuccess(data, "File uploaded successfully");
      } catch (error: any) {
        console.log(error);

        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      body: uploadFileBody,
      detail: { summary: "Upload File to Vault", tags: ["Vault"] },
    },
  )
  .delete(
    "/:id",
    async ({ workspaceId, params: { id } }) => {
      const data = await vaultService.deleteFile(workspaceId!, id);
      return buildSuccess(data, "File deleted successfully");
    },
    { detail: { summary: "Delete Vault File", tags: ["Vault"] } },
  )
  .get(
    "/:id/download",
    async ({ workspaceId, params: { id } }) => {
      const url = await vaultService.getDownloadUrl(workspaceId!, id);
      return buildSuccess({ url }, "Download URL generated");
    },
    { detail: { summary: "Get Download URL", tags: ["Vault"] } },
  )
  .patch(
    "/:id/tags",
    async ({ workspaceId, params: { id }, body: { tags } }) => {
      const data = await vaultService.updateTags(workspaceId!, id, tags);
      return buildSuccess(data, "Tags updated successfully");
    },
    {
      body: updateTagsBody,
      detail: { summary: "Update Vault File Tags", tags: ["Vault"] },
    },
  );
