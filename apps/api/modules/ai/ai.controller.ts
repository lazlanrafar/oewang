import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { AiService } from "./ai.service";
import { ChatRequestDto, ParseReceiptDto } from "./ai.dto";
import { logger } from "@workspace/logger";

export const aiController = new Elysia({ prefix: "/ai" })
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
    "/sessions",
    async ({ workspaceId }) => {
      const sessions = await AiService.getSessions(workspaceId!);
      return buildSuccess(sessions, "Sessions retrieved");
    },
    {
      detail: {
        summary: "Get AI Sessions",
        description: "Returns a list of previous AI chat sessions for the active workspace.",
        tags: ["AI"],
      },
    },
  )
  .get(
    "/sessions/:id",
    async ({ params: { id }, workspaceId }) => {
      const messages = await AiService.getSessionMessages(id, workspaceId!);
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
    async ({ params: { id }, workspaceId }) => {
      const session = await AiService.getSession(id, workspaceId!);
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
    "/chat",
    async ({ body, workspaceId, userId, set }) => {
      try {
        const response = await AiService.chat(
          body.messages,
          workspaceId!,
          userId!,
          body.sessionId,
        );
        return buildSuccess(response, "Chat response generated");
      } catch (error: any) {
        // If it's a custom status response (e.g. from Elysia's status() helper), propagate it
        if (error.code && error.response) {
          set.status = error.code;
          return error.response;
        }

        logger.error("Error generating AI response", { error, userId, sessionId: body.sessionId });

        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          error?.message ?? "Failed to generate AI response",
        );
      }
    },
    {
      body: ChatRequestDto,
      detail: {
        summary: "Chat with AI",
        description: "Sends messages to the AI and returns a response, optionally within a session. Supports function calling for financial tasks.",
        tags: ["AI"],
      },
    },
  )
  .post(
    "/parse-receipt",
    async ({ body, workspaceId, userId, set }) => {
      try {
        const result = await AiService.parseReceipt(
          workspaceId!,
          userId!,
          body.file.data,
          body.file.type,
        );
        return buildSuccess(result, "Receipt parsed successfully");
      } catch (error: any) {
        logger.error("Error parsing receipt", { error, workspaceId });
        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          error?.message ?? "Failed to parse receipt",
        );
      }
    },
    {
      body: ParseReceiptDto,
      detail: {
        summary: "Parse Receipt",
        description: "Extracts transaction data from a receipt image or PDF using AI.",
        tags: ["AI"],
      },
    },
  );
