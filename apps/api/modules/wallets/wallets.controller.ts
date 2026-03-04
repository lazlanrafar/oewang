import { Elysia, t } from "elysia";
import { walletsService } from "./wallets.service";
import { authPlugin } from "../../plugins/auth";
import { buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import {
  createWalletBody,
  createWalletGroupBody,
  reorderWalletGroupsBody,
  reorderWalletsBody,
  updateWalletBody,
  updateWalletGroupBody,
} from "./wallets.dto";

export const walletsController = new Elysia()
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
  .group("/wallet-groups", (app) =>
    app
      .get(
        "/",
        async ({ workspaceId }) => {
          const data = await walletsService.getGroups(workspaceId!);
          return buildSuccess(data, "Wallet groups retrieved");
        },
        { detail: { summary: "Get Wallet Groups", tags: ["Wallets"] } },
      )
      .post(
        "/",
        async ({ workspaceId, body, set }) => {
          const data = await walletsService.createGroup(workspaceId!, body);
          set.status = 201;
          return buildSuccess(data, "Wallet group created");
        },
        {
          body: createWalletGroupBody,
          detail: { summary: "Create Wallet Group", tags: ["Wallets"] },
        },
      )
      .put(
        "/reorder",
        async ({ workspaceId, body }) => {
          await walletsService.reorderGroups(workspaceId!, body.updates);
          return buildSuccess(null, "Wallet groups reordered");
        },
        {
          body: reorderWalletGroupsBody,
          detail: { summary: "Reorder Wallet Groups", tags: ["Wallets"] },
        },
      )
      .put(
        "/:id",
        async ({ workspaceId, params: { id }, body }) => {
          const data = await walletsService.updateGroup(workspaceId!, id, body);
          return buildSuccess(data, "Wallet group updated");
        },
        {
          body: updateWalletGroupBody,
          detail: { summary: "Update Wallet Group", tags: ["Wallets"] },
        },
      )
      .delete(
        "/:id",
        async ({ workspaceId, params: { id } }) => {
          const data = await walletsService.deleteGroup(workspaceId!, id);
          return buildSuccess(data, "Wallet group deleted");
        },
        { detail: { summary: "Delete Wallet Group", tags: ["Wallets"] } },
      ),
  )
  .group("/wallets", (app) =>
    app
      .get(
        "/",
        async ({ workspaceId }) => {
          const data = await walletsService.getWallets(workspaceId!);
          return buildSuccess(data, "Wallets retrieved");
        },
        { detail: { summary: "Get Wallets", tags: ["Wallets"] } },
      )
      .post(
        "/",
        async ({ workspaceId, body, set }) => {
          const data = await walletsService.createWallet(workspaceId!, body);
          set.status = 201;
          return buildSuccess(data, "Wallet created");
        },
        {
          body: createWalletBody,
          detail: { summary: "Create Wallet", tags: ["Wallets"] },
        },
      )
      .put(
        "/reorder",
        async ({ workspaceId, body }) => {
          await walletsService.reorderWallets(workspaceId!, body.updates);
          return buildSuccess(null, "Wallets reordered");
        },
        {
          body: reorderWalletsBody,
          detail: { summary: "Reorder Wallets", tags: ["Wallets"] },
        },
      )
      .put(
        "/:id",
        async ({ workspaceId, params: { id }, body }) => {
          const data = await walletsService.updateWallet(
            workspaceId!,
            id,
            body,
          );
          return buildSuccess(data, "Wallet updated");
        },
        {
          body: updateWalletBody,
          detail: { summary: "Update Wallet", tags: ["Wallets"] },
        },
      )
      .delete(
        "/:id",
        async ({ workspaceId, params: { id } }) => {
          const data = await walletsService.deleteWallet(workspaceId!, id);
          return buildSuccess(data, "Wallet deleted");
        },
        { detail: { summary: "Delete Wallet", tags: ["Wallets"] } },
      ),
  );
