import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { UpdateAgentSettingsDto } from "./agent-settings.dto";
import { AgentSettingsService } from "./agent-settings.service";

export const agentSettingsController = new Elysia({
  prefix: "/ai/agent-settings",
})
  .use(authPlugin)
  .derive(({ auth }) => ({ workspaceId: auth?.workspace_id }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .get(
    "/",
    async ({ workspaceId }) => {
      const settings = await AgentSettingsService.get(workspaceId!);
      return buildSuccess(settings, "Agent settings retrieved");
    },
    {
      detail: {
        summary: "Get AI Agent Settings",
        description:
          "Returns the current AI agent configuration for the workspace (model, temperature, instructions, etc.).",
        tags: ["AI"],
      },
    },
  )
  .put(
    "/",
    async ({ body, workspaceId, auth }) => {
      const updated = await AgentSettingsService.update(
        workspaceId!,
        auth!.user_id,
        {
          model: body.model,
          temperature: body.temperature,
          max_steps: body.max_steps,
          custom_instructions: body.custom_instructions,
          response_language: body.response_language,
        },
      );
      return buildSuccess(updated, "Agent settings updated");
    },
    {
      body: UpdateAgentSettingsDto,
      detail: {
        summary: "Update AI Agent Settings",
        description:
          "Adjust the AI agent's model, temperature, step limit, custom instructions, and response language.",
        tags: ["AI"],
      },
    },
  );
