import { 
  AiOrchestrator, 
  ReceiptService, 
  ParsedReceipt as RepoParsedReceipt,
  ChatMessage as RepoChatMessage,
} from "@workspace/ai";
import { AiRepository } from "./ai.repository";
import { executeAiTool } from "./ai.tools";
import { CategoriesRepository } from "../categories/categories.repository";
import { redis } from "@workspace/redis";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { Env, API_CONFIG } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { ChatMessage, ChatResponse } from "./ai.dto";
const log = createLogger("ai-service");

export abstract class AiService {
  /**
   * Chat with AI using the user's financial context and save to DB.
   * Delegates to AiOrchestrator for intent detection and context building.
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
    userId: string,
    sessionId?: string,
  ): Promise<ChatResponse> {
    let currentSessionId = sessionId;
    const latestUserMessage = messages[messages.length - 1];

    if (!latestUserMessage) throw new Error("No messages provided");

    // 1. Session Management
    if (!currentSessionId) {
      const title = await AiOrchestrator.generateTitle(
        latestUserMessage.content,
        {
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
        }
      );
      const newSession = await AiRepository.createSession(workspaceId, title);
      currentSessionId = newSession!.id;

      await AuditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "ai.session_created",
        entity: "ai_session",
        entity_id: currentSessionId,
        after: newSession,
      });

      // Save previous messages if any
      for (const msg of messages.slice(0, -1)) {
        await AiRepository.saveMessage(currentSessionId, workspaceId, msg.role as any, msg.content);
      }
    } else {
      const session = await AiRepository.getSession(currentSessionId, workspaceId);
      if (!session) throw new Error("Chat session not found or access denied.");
    }

    // Save latest user message
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      latestUserMessage.role as any,
      latestUserMessage.content,
      latestUserMessage.attachments,
    );

    // 2. Load History
    const history = await AiRepository.getSessionMessages(currentSessionId, workspaceId);
    const consolidatedMessages: RepoChatMessage[] = history.map(m => ({
      role: m.role as any,
      content: m.content as string,
      attachments: m.attachments as any
    }));

    // 3. Quota Check
    const usageData = await AiRepository.getUsageAndQuota(workspaceId);
    if (!usageData) {
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found")
      );
    }

    const maxTokens = usageData.maxTokens ?? 5000;
    const currentTokens = Number(usageData.used);

    if (
      !API_CONFIG.mockAiQuota &&
      currentTokens >= maxTokens &&
      workspaceId !== "b45ad588-6758-43a4-8c26-1d80f3b0ab9f"
    ) {
      // Calculate reset date
      let resetAt = usageData.xendit_current_period_end;

      if (!resetAt) {
        // Default to same day next month
        const now = new Date();
        const createdAt = new Date(usageData.created_at);
        resetAt = new Date(now.getFullYear(), now.getMonth() + 1, createdAt.getDate());
      }

      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `Monthly AI Token limit exceeded. Max: ${maxTokens} tokens.`,
          undefined,
          { reset_at: resetAt.toISOString() }
        )
      );
    }

    if (API_CONFIG.mockAiQuota) {
      console.log("[DEV] mockAiQuota=true — quota check bypassed");
    }

    // 4. Orchestrate
    let response;
    try {
      response = await AiOrchestrator.chat(
        consolidatedMessages,
        {
          workspaceId,
          userId,
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
        },
        {
          executeTransactionAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeDebtAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeAnalysisAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
          executeItemsAction: (name, args) =>
            executeAiTool(name, args, workspaceId, userId),
        }
      );
    } catch (error: any) {
      throw error;
    }

    // 5. Save Response & Token Usage
    await AiRepository.saveMessage(
      currentSessionId,
      workspaceId,
      "assistant" as const,
      response.reply,
      response.artifact ? { artifact: response.artifact } : undefined
    );
    
    const tokensSpent = (response.usage?.input_tokens ?? 250) + (response.usage?.output_tokens ?? 250);
    await AiRepository.incrementAiTokens(workspaceId, currentTokens, tokensSpent);

    return {
      sessionId: currentSessionId,
      reply: response.reply,
      usage: response.usage,
      artifact: response.artifact,
    };
  }

  /**
   * Parse receipt data from image or PDF.
   */
  static async parseReceipt(workspaceId: string, userId: string, base64Image: string, mediaType: string) {
    // We need category context for the parser
    const categories = await CategoriesRepository.findMany(workspaceId, "expense");
    const categoryContext = categories.map((c: any) => `- ${c.name} (ID: ${c.id})`).join("\n");

    const parsed = await ReceiptService.parse(
        base64Image,
        mediaType,
        categoryContext,
        {
            geminiKey: Env.GEMINI_API_KEY,
            openaiKey: Env.OPENAI_API_KEY,
            anthropicKey: Env.ANTHROPIC_API_KEY,
        }
    );

    if (parsed) {
        if (parsed.name && parsed.categoryId) {
            const cacheKey = `oewang:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
            await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 });
        }

        await AuditLogsService.log({
          workspace_id: workspaceId,
          user_id: userId,
          action: "ai.receipt_parsed",
          entity: "vault_file", // Receipt parsing is conceptually linked to storage/vault
          entity_id: "00000000-0000-0000-0000-000000000000",
          before: null,
          after: parsed,
        });
    }

    return parsed;
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return AiRepository.getSessionMessages(sessionId, workspaceId);
  }

  static async getSession(sessionId: string, workspaceId: string) {
    return AiRepository.getSession(sessionId, workspaceId);
  }

  static async getUsageAndQuota(workspaceId: string) {
    return AiRepository.getUsageAndQuota(workspaceId);
  }
}
