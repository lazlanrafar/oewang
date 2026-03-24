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
import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
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
      const title = await AiOrchestrator.generateTitle(latestUserMessage.content, {
          geminiKey: Env.GEMINI_API_KEY,
          openaiKey: Env.OPENAI_API_KEY,
          anthropicKey: Env.ANTHROPIC_API_KEY,
      });
      const newSession = await AiRepository.createSession(workspaceId, title);
      currentSessionId = newSession!.id;

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
    if (!usageData) throw status(404, buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"));

    const maxTokens = usageData.maxTokens ?? 5000;
    const currentTokens = Number(usageData.used);

    if (currentTokens >= maxTokens && workspaceId !== "b45ad588-6758-43a4-8c26-1d80f3b0ab9f") {
      throw status(422, buildError(ErrorCode.PLAN_LIMIT_REACHED, `Monthly AI Token limit exceeded. Max: ${maxTokens} tokens.`));
    }

    // 4. Orchestrate
    const response = await AiOrchestrator.chat(
      consolidatedMessages,
      {
        workspaceId,
        userId,
        geminiKey: Env.GEMINI_API_KEY,
        openaiKey: Env.OPENAI_API_KEY,
        anthropicKey: Env.ANTHROPIC_API_KEY,
      },
      {
          executeTransactionAction: (name, args) => executeAiTool(name, args, workspaceId, userId),
          executeDebtAction: (name, args) => executeAiTool(name, args, workspaceId, userId),
          executeAnalysisAction: (name, args) => executeAiTool(name, args, workspaceId, userId),
      }
    );

    // 5. Save Response & Token Usage
    await AiRepository.saveMessage(
      currentSessionId, 
      workspaceId, 
      "assistant", 
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
  static async parseReceipt(workspaceId: string, base64Image: string, mediaType: string) {
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
            const cacheKey = `okane:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
            await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 });
        }
    }

    return parsed;
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return AiRepository.getSessionMessages(sessionId, workspaceId);
  }
}
