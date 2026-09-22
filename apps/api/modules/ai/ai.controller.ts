import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia, status } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { agentSettingsController } from "./agent-settings.controller";
import { ParseReceiptDto } from "./ai.dto";
import { AiService } from "./ai.service";

const log = createLogger("ai.controller");

export const aiController = new Elysia({ prefix: "/ai" })
  .use(agentSettingsController)
  .use(authPlugin)
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
    "/sessions",
    async ({ workspaceId, userId }) => {
      const sessions = await AiService.getSessions(workspaceId!, userId!);
      return buildSuccess(sessions, "Sessions retrieved");
    },
    {
      detail: {
        summary: "Get AI Sessions",
        description:
          "Returns a list of previous AI chat sessions for the active workspace.",
        tags: ["AI"],
      },
    },
  )
  .get(
    "/sessions/:id",
    async ({ params: { id }, workspaceId, userId }) => {
      const messages = await AiService.getSessionMessages(
        id,
        workspaceId!,
        userId!,
      );
      return buildSuccess(messages, "Session messages retrieved");
    },
    {
      detail: {
        summary: "Get Session Messages",
        description: "Retrieves all messages for a specific AI chat session.",
        tags: ["AI"],
      },
    },
  )
  .get(
    "/sessions/:id/metadata",
    async ({ params: { id }, workspaceId, userId }) => {
      const session = await AiService.getSession(id, workspaceId!, userId!);
      return buildSuccess(session, "Session metadata retrieved");
    },
    {
      detail: {
        summary: "Get Session Metadata",
        description: "Retrieves metadata for a specific AI chat session.",
        tags: ["AI"],
      },
    },
  )
  .get(
    "/quota",
    async ({ workspaceId }) => {
      const quota = await AiService.getUsageAndQuota(workspaceId!);
      return buildSuccess(quota, "Quota retrieved");
    },
    {
      detail: {
        summary: "Get AI Quota",
        tags: ["AI"],
      },
    },
  )
  .post(
    "/parse-receipt",
    async ({ body, workspaceId, userId }) => {
      try {
        const result = await AiService.parseReceipt(
          workspaceId!,
          userId!,
          body.file.data,
          body.file.type,
        );
        return buildSuccess(result, "Receipt parsed successfully");
      } catch (error: any) {
        log.error("Error parsing receipt", {
          message: error?.message,
          name: error?.name,
          workspaceId,
        });
        // ai-sidecar-client attaches .status/.body so we can tell a
        // deliberate 422 quota block apart from a genuine sidecar failure —
        // rethrow via status() so the global onError handler (index.ts)
        // Sentry-captures real failures and applies its own message
        // sanitization consistently with every other module.
        const httpStatus =
          typeof error?.status === "number" ? error.status : 500;
        const sidecarErrorCode =
          typeof error?.body?.error === "string" ? error.body.error : undefined;
        const message =
          httpStatus >= 500
            ? "Failed to parse receipt"
            : (sidecarErrorCode ?? error?.message ?? "Failed to parse receipt");
        throw status(
          httpStatus,
          buildError(sidecarErrorCode ?? ErrorCode.INTERNAL_ERROR, message),
        );
      }
    },
    {
      body: ParseReceiptDto,
      detail: {
        summary: "Parse Receipt",
        description:
          "Extracts transaction data from a receipt image or PDF using AI.",
        tags: ["AI"],
      },
    },
  );
