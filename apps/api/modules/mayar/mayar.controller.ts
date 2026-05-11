import { Elysia } from "elysia";
import { MayarService } from "./mayar.service";
import { MayarRepository } from "./mayar.repository";
import { CreateMayarCheckoutDto, MayarWebhookDto, CancelAddonDto } from "./mayar.dto";
import { authPlugin } from "../../plugins/auth";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { WorkspacesRepository } from "../workspaces/workspaces.repository";
import { assertCanManageSensitiveWorkspace } from "../workspaces/workspace-permissions";

export const mayarController = new Elysia({
  prefix: "/mayar",
  name: "mayar.controller",
})
  .post(
    "/webhook",
    async ({ body, headers }) => {
      try {
        const rawAuthorization = headers["authorization"];
        const bearerToken =
          typeof rawAuthorization === "string" &&
          rawAuthorization.toLowerCase().startsWith("bearer ")
            ? rawAuthorization.slice(7).trim()
            : rawAuthorization;
        const token =
          headers["x-mayar-token"] ||
          headers["x-callback-token"] ||
          bearerToken;
        await MayarService.handleWebhook(body, token);
        return { success: true };
      } catch (err: any) {
        console.error("[Mayar Webhook Error]", err.stack || err.message);
        return { success: false, error: "Webhook processing failed" };
      }
    },
    {
      body: MayarWebhookDto,
      detail: { summary: "Mayar Webhook", tags: ["Mayar"] },
    },
  )
  .use(authPlugin)
  .post(
    "/portal/magic-link",
    async ({ auth, status }) => {
      if (!auth) {
        throw status(
          401,
          buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"),
        );
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      // Find workspace owner or customer email from workspace context
      const workspace = await MayarRepository.findWorkspaceById(
        auth.workspaceId,
      );
      const email = workspace?.mayar_customer_email;

      if (!email) {
        throw status(
          404,
          buildError(ErrorCode.NOT_FOUND, "No customer billing email found for this workspace"),
        );
      }

      return await MayarService.sendCustomerPortalMagicLink(email);
    },
  )
  .post(
    "/checkout",
    async ({ body, auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      const {
        priceId,
        workspaceId,
        returnPath,
        type,
        addonType,
        amount,
        addonId,
        billing,
        locale,
      } = body;

      if (workspaceId && workspaceId !== auth.workspaceId) {
        const membership = await WorkspacesRepository.getMembership(
          auth.user_id,
          workspaceId,
        );
        if (!membership) {
          return status(403, buildError(ErrorCode.FORBIDDEN, "Forbidden"));
        }
      }

      const targetWorkspaceId = workspaceId || auth.workspaceId;

      return MayarService.createCheckoutSession(
        targetWorkspaceId,
        auth.user_id,
        priceId,
        returnPath,
        {
          metadata: {
            type,
            addonType,
            amount,
            addonId,
            billing,
            locale,
          },
        },
      );
    },
    {
      body: CreateMayarCheckoutDto,
      detail: { summary: "Create Mayar Checkout Session", tags: ["Mayar"] },
    },
  )
  .post(
    "/portal",
    async ({ auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      
      return MayarService.createCustomerPortal(auth.email);
    },
    { detail: { summary: "Customer Portal Redirect", tags: ["Mayar"] } },
  )
  .post(
    "/sync",
    async ({ auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      
      await MayarService.syncWorkspaceInvoices(auth.workspaceId, auth.email || "");
      return { success: true };
    },
    { detail: { summary: "Sync Workspace Invoices", tags: ["Mayar"] } },
  )
  .get(
    "/invoices/:id",
    async ({ params, auth, status }) => {
      if (!auth) {
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return MayarService.getInvoiceUrl(params.id);
    },
    { detail: { summary: "Get Invoice URL", tags: ["Mayar"] } },
  )
  .post(
    "/cancel-subscription",
    async ({ auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return MayarService.cancelSubscription(auth.workspaceId);
    },
    { detail: { summary: "Cancel Subscription", tags: ["Mayar"] } },
  )
  .post(
    "/cancel-addon",
    async ({ auth, body, status }) => {
      if (!auth)
        return status(
          401,
          buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"),
        );
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return MayarService.cancelAddon(
        auth.workspaceId,
        body.addonId,
        auth.user_id,
      );
    },
    {
      body: CancelAddonDto,
      detail: { summary: "Cancel Add-on", tags: ["Mayar"] },
    },
  );
