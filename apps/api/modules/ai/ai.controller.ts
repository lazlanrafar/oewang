import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { AiService } from "./ai.service";
import { ChatRequestDto } from "./ai.dto";

export const aiController = new Elysia({ prefix: "/ai" })
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
  .post(
    "/chat",
    async ({ body, workspaceId, set }) => {
      try {
        const response = await AiService.chat(body.messages, workspaceId!);
        return buildSuccess(response, "Chat response generated");
      } catch (error: any) {
        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          error?.message ?? "Failed to generate AI response",
        );
      }
    },
    { body: ChatRequestDto },
  );
