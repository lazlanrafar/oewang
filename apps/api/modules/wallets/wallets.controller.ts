import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia, t } from "elysia";
// ... (omitted for brevity, will use literal matches)
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";
import {
  createWalletBody,
  createWalletGroupBody,
  reorderWalletGroupsBody,
  reorderWalletsBody,
  updateWalletBody,
  updateWalletGroupBody,
} from "./wallets.dto";
import { WalletsService } from "./wallets.service";

export const walletsController = new Elysia()
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
  .group("/wallet-groups", (app) =>
    app
      .get(
        "/",
        async ({ workspaceId }) => {
          const data = await WalletsService.getGroups(workspaceId!);
          return buildSuccess(data, "Wallet groups retrieved");
        },
        {
          detail: {
            summary: "Get Wallet Groups",
            description:
              "Returns all wallet groups for the active workspace, including their sorted order.",
            tags: ["Wallets"],
          },
        },
      )
      .post(
        "/",
        async ({ auth, workspaceId, userId, body, set }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.createGroup(
            workspaceId!,
            userId!,
            body,
          );
          set.status = 201;
          return buildSuccess(data, "Wallet group created");
        },
        {
          body: createWalletGroupBody,
          detail: {
            summary: "Create Wallet Group",
            description: "Creates a new organizational group for wallets.",
            tags: ["Wallets"],
          },
        },
      )
      .put(
        "/reorder",
        async ({ auth, workspaceId, userId, body }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          await WalletsService.reorderGroups(
            workspaceId!,
            userId!,
            body.updates,
          );
          return buildSuccess(null, "Wallet groups reordered");
        },
        {
          body: reorderWalletGroupsBody,
          detail: {
            summary: "Reorder Wallet Groups",
            description:
              "Updates the sorting order for multiple wallet groups simultaneously.",
            tags: ["Wallets"],
          },
        },
      )
      .put(
        "/:id",
        async ({ auth, workspaceId, userId, params: { id }, body }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.updateGroup(
            workspaceId!,
            userId!,
            id,
            body,
          );
          return buildSuccess(data, "Wallet group updated");
        },
        {
          body: updateWalletGroupBody,
          detail: {
            summary: "Update Wallet Group",
            description:
              "Updates the name or settings of an existing wallet group.",
            tags: ["Wallets"],
          },
        },
      )
      .delete(
        "/:id",
        async ({ auth, workspaceId, userId, params: { id } }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.deleteGroup(
            workspaceId!,
            userId!,
            id,
          );
          return buildSuccess(data, "Wallet group deleted");
        },
        {
          detail: {
            summary: "Delete Wallet Group",
            description:
              "Soft-deletes a wallet group. Wallets inside the group will be moved to 'Uncategorized'.",
            tags: ["Wallets"],
          },
        },
      ),
  )
  .group("/wallets", (app) =>
    app
      .get(
        "/",
        async ({ workspaceId, query }) => {
          const data = await WalletsService.getWallets(workspaceId!, query);
          return data;
        },
        {
          query: t.Object({
            search: t.Optional(t.String()),
            groupId: t.Optional(t.String()),
            page: t.Optional(t.Numeric({ minimum: 1 })),
            limit: t.Optional(t.Numeric({ minimum: 1, maximum: 250 })),
          }),
          detail: {
            summary: "Get Wallets",
            description:
              "Returns a paginated list of wallets for the workspace, with optional filtering by group and search term.",
            tags: ["Wallets"],
          },
        },
      )
      .get(
        "/:id",
        async ({ workspaceId, params: { id } }) => {
          const data = await WalletsService.getById(workspaceId!, id);
          return buildSuccess(data, "Wallet retrieved successfully");
        },
        {
          detail: {
            summary: "Get Wallet by ID",
            description: "Returns detailed information for a single wallet.",
            tags: ["Wallets"],
          },
        },
      )
      .post(
        "/",
        async ({ auth, workspaceId, userId, body, set }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.createWallet(
            workspaceId!,
            userId!,
            body,
          );
          set.status = 201;
          return buildSuccess(data, "Wallet created");
        },
        {
          body: createWalletBody,
          detail: {
            summary: "Create Wallet",
            description:
              "Creates a new wallet (bank account, cash, etc.) with an initial balance.",
            tags: ["Wallets"],
          },
        },
      )
      .put(
        "/reorder",
        async ({ auth, workspaceId, userId, body }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          await WalletsService.reorderWallets(
            workspaceId!,
            userId!,
            body.updates,
          );
          return buildSuccess(null, "Wallets reordered");
        },
        {
          body: reorderWalletsBody,
          detail: {
            summary: "Reorder Wallets",
            description:
              "Updates the sorting order and group assignment for multiple wallets.",
            tags: ["Wallets"],
          },
        },
      )
      .put(
        "/:id",
        async ({ auth, workspaceId, userId, params: { id }, body }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.updateWallet(
            workspaceId!,
            userId!,
            id,
            body,
          );
          return buildSuccess(data, "Wallet updated");
        },
        {
          body: updateWalletBody,
          detail: {
            summary: "Update Wallet",
            description:
              "Updates wallet details like name, group, or visibility in totals.",
            tags: ["Wallets"],
          },
        },
      )
      .delete(
        "/:id",
        async ({ auth, workspaceId, userId, params: { id } }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.deleteWallet(
            workspaceId!,
            userId!,
            id,
          );
          return buildSuccess(data, "Wallet deleted");
        },
        { detail: { summary: "Delete Wallet", tags: ["Wallets"] } },
      )
      .put(
        "/:id/default",
        async ({ auth, workspaceId, userId, params: { id } }) => {
          assertCanEditWorkspaceData(auth?.workspace_role);
          const data = await WalletsService.setDefaultWallet(
            workspaceId!,
            userId!,
            id,
          );
          return buildSuccess(data, "Default wallet updated");
        },
        {
          detail: {
            summary: "Set Default Wallet",
            description:
              "Marks the wallet as the workspace default. Used by the AI bot when the user doesn't specify an account.",
            tags: ["Wallets"],
          },
        },
      ),
  );
