import { ChatMessage, ChatResponse, Intent } from "../types";
import { IntentService } from "../intent/intent.service";
import { ContextService } from "../context/context.service";
import { ProviderFactory, ProviderOptions } from "../providers/provider.factory";
import { aiToolDefinitions } from "../tools/tool.definitions";
import { ToolExecutor, ToolServices } from "../tools/tool.executor";
import { SYSTEM_PROMPT_BASE } from "./prompts";
import { log } from "../utils/logger";

export interface OrchestratorOptions extends ProviderOptions {
  workspaceId: string;
  userId: string;
}

export abstract class AiOrchestrator {
  static async chat(
    messages: ChatMessage[],
    options: OrchestratorOptions,
    services: ToolServices
  ): Promise<ChatResponse> {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) throw new Error("No messages provided to orchestrator.");

    // 1. Detect Intent
    const intent = IntentService.detectIntent(lastMsg.content);
    log.info(`[AiOrchestrator] Detected Intent: ${intent}`);

    // 2. Build Context by Intent
    const context = await ContextService.buildContextByIntent(options.workspaceId, intent);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${context}`;

    // 3. Preparation for Tool Execution
    const onToolCall = async (name: string, args: any) => {
        return await ToolExecutor.execute(name, args, services);
    };

    // 4. Call Provider Factory
    const response = await ProviderFactory.chat(
        messages,
        systemPrompt,
        options,
        aiToolDefinitions,
        onToolCall
    );

    return response;
  }

  static async generateTitle(message: string, options: ProviderOptions): Promise<string> {
      return await ProviderFactory.generateTitle(message, options);
  }
}
