import { ChatMessage, ChatResponse } from "../types";
import { GeminiProvider } from "./gemini.provider";
import { OpenAIProvider } from "./openai.provider";
import { ClaudeProvider } from "./claude.provider";
import { log } from "../utils/logger";

export interface ProviderOptions {
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
}

export abstract class ProviderFactory {
  static async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    options: ProviderOptions,
    tools?: any[],
    onToolCall?: (name: string, args: any) => Promise<any>
  ): Promise<ChatResponse> {
    // 1. Gemini
    if (options.geminiKey) {
      try {
        return await GeminiProvider.chat(messages, systemPrompt, options.geminiKey, tools, onToolCall);
      } catch (e: any) {
        log.error(`Gemini failed: ${e.message}. Falling back to OpenAI...`);
      }
    }

    // 2. OpenAI
    if (options.openaiKey) {
      try {
        return await OpenAIProvider.chat(messages, systemPrompt, options.openaiKey, tools, onToolCall);
      } catch (e: any) {
        log.error(`OpenAI failed: ${e.message}. Falling back to Claude...`);
      }
    }

    // 3. Claude
    if (options.anthropicKey) {
      return await ClaudeProvider.chat(messages, systemPrompt, options.anthropicKey, tools, onToolCall);
    }

    throw new Error("No AI provider API keys available for chat.");
  }

  static async generateTitle(message: string, options: ProviderOptions): Promise<string> {
      if (options.geminiKey) {
          try { return await GeminiProvider.generateTitle(message, options.geminiKey); } catch(e) {}
      }
      if (options.openaiKey) {
          try { return await OpenAIProvider.generateTitle(message, options.openaiKey); } catch(e) {}
      }
      if (options.anthropicKey) {
          try { return await ClaudeProvider.generateTitle(message, options.anthropicKey); } catch(e) {}
      }
      return "New Chat";
  }
}
