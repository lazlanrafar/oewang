import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { assertCanManageSensitiveWorkspace } from "../workspaces/workspace-permissions";
import { WorkspacesRepository } from "../workspaces/workspaces.repository";
import {
  CancelAddonDto,
  CreateMayarCheckoutDto,
  MayarWebhookDto,
  SchedulePlanSwitchDto,
} from "./mayar.dto";
import { MayarRepository } from "./mayar.repository";
import { MayarService } from "./mayar.service";

// Enqueues onto the Go worker (apps/worker) instead of awaiting full
// processing in-process — asynq gives retry/DLQ for a real payment webhook
// instead of the old synchronous best-effort processing.
async function enqueueMayarWebhook(body: unknown, token?: string): Promise<void> {
  const workerUrl = Env.WORKER_URL;
  const workerApiKey = Env.WORKER_API_KEY;
  if (!workerUrl || !workerApiKey) {
    throw new Error(
      "Worker is not configured (WORKER_URL/WORKER_API_KEY missing)",
    );
  }

  const res = await fetch(
    `${workerUrl.replace(/\/$/, "")}/internal/enqueue/mayar-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": workerApiKey,
      },
      body: JSON.stringify({ body, token }),
    },
  );

  if (!res.ok) {
    throw new Error(`Worker enqueue failed: ${res.status}`);
  }
}

export const mayarController = new Elysia({
  prefix: "/mayar",
  name: "mayar.controller",
})
  .post(
    "/webhook",
    async ({ body, headers, set }) => {
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

      // Sync token check first — still a fast 401 on a bad signature, same as
      // before, just via the extracted verifyWebhookToken instead of the
      // (now-async) handleWebhook. No enqueue happens on a bad token.
      if (!MayarService.verifyWebhookToken(token)) {
        set.status = 401;
        return { success: false, error: "Invalid webhook token" };
      }

      try {
        // Enqueue only — actual processing (MayarService.handleWebhook) now
        // happens inside the internal endpoint the Go worker calls, not here.
        await enqueueMayarWebhook(body, token);
      } catch (err: any) {
        // Unlike the Telegram path, Mayar's own retry semantics depend on a
        // non-2xx response, so a failed enqueue (worker unreachable) should
        // still surface as a failure worth retrying — not a silent 200.
        logger.error("Mayar webhook enqueue failed", {
          err: err.message,
          stack: err.stack,
        });
        set.status = 500;
        return { success: false, error: "Webhook enqueue failed" };
      }

      return { success: true };
    },
    {
      body: MayarWebhookDto,
      detail: { summary: "Mayar Webhook", tags: ["Mayar"] },
    },
  )
  .use(authPlugin)
  .post("/portal/magic-link", async ({ auth, status }) => {
    if (!auth) {
      throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    assertCanManageSensitiveWorkspace(auth.workspace_role);

    // Find workspace owner or customer email from workspace context
    const workspace = await MayarRepository.findWorkspaceById(auth.workspaceId);
    const email = workspace?.mayar_customer_email;

    if (!email) {
      throw status(
        404,
        buildError(
          ErrorCode.NOT_FOUND,
          "No customer billing email found for this workspace",
        ),
      );
    }

    return await MayarService.sendCustomerPortalMagicLink(email);
  })
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
        qty,
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

      try {
        return await MayarService.createCheckoutSession(
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
              qty,
              billing,
              locale,
            },
          },
        );
      } catch (err: any) {
        // Re-throw Elysia status() errors as-is; wrap plain errors with the actual message
        if (err?.status !== undefined || err?._check !== undefined) throw err;
        const message = err?.message || "Checkout failed";
        logger.error("[Checkout] Error creating session", {
          message,
          stack: err?.stack,
        });
        throw status(500, buildError(ErrorCode.INTERNAL_ERROR, message));
      }
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

      await MayarService.syncWorkspaceInvoices(
        auth.workspaceId,
        auth.email || "",
      );
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
      return MayarService.cancelSubscription(auth.workspaceId, auth.user_id);
    },
    { detail: { summary: "Cancel Subscription", tags: ["Mayar"] } },
  )
  .post(
    "/resume-subscription",
    async ({ auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return MayarService.resumeSubscription(auth.workspaceId, auth.user_id);
    },
    { detail: { summary: "Resume Cancelled Subscription", tags: ["Mayar"] } },
  )
  .post(
    "/schedule-plan-switch",
    async ({ auth, body, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return MayarService.schedulePlanSwitch(
        auth.workspaceId,
        auth.user_id,
        body.planId,
        body.billing,
      );
    },
    {
      body: SchedulePlanSwitchDto,
      detail: { summary: "Schedule Plan Switch at Renewal", tags: ["Mayar"] },
    },
  )
  .post(
    "/cancel-pending-plan-switch",
    async ({ auth, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      return MayarService.cancelPendingPlanSwitch(
        auth.workspaceId,
        auth.user_id,
      );
    },
    { detail: { summary: "Cancel Pending Plan Switch", tags: ["Mayar"] } },
  )
  .post(
    "/cancel-addon",
    async ({ auth, body, status }) => {
      if (!auth)
        return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
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
