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
    onToolCall?: (name: string, args: any) => Promise<any>,
  ): Promise<ChatResponse> {
    const errors: string[] = [];

    // 1. OpenAI
    if (options.openaiKey) {
      try {
        return await OpenAIProvider.chat(
          messages,
          systemPrompt,
          options.openaiKey,
          tools,
          onToolCall,
        );
      } catch (e: any) {
        const msg = e.message ?? String(e);
        errors.push(`OpenAI: ${msg}`);
        log.error(`OpenAI failed: ${msg}. Falling back to Gemini...`);
      }
    }

    // 2. Gemini
    if (options.geminiKey) {
      try {
        return await GeminiProvider.chat(
          messages,
          systemPrompt,
          options.geminiKey,
          tools,
          onToolCall,
        );
      } catch (e: any) {
        const msg = e.message ?? String(e);
        errors.push(`Gemini: ${msg}`);
        log.error(`Gemini failed: ${msg}. Falling back to Claude...`);
      }
    }

    // 3. Claude
    if (options.anthropicKey) {
      return await ClaudeProvider.chat(
        messages,
        systemPrompt,
        options.anthropicKey,
        tools,
        onToolCall,
      );
    }

    const summary =
      errors.length > 0
        ? `All AI providers failed. ${errors.join(" | ")}`
        : "No AI provider API keys configured.";
    throw new Error(summary);
  }

  static async generateTitle(
    message: string,
    options: ProviderOptions,
  ): Promise<string> {
    if (options.openaiKey) {
      try {
        return await OpenAIProvider.generateTitle(message, options.openaiKey);
      } catch (e) {}
    }
    if (options.geminiKey) {
      try {
        return await GeminiProvider.generateTitle(message, options.geminiKey);
      } catch (e) {}
    }
    if (options.anthropicKey) {
      try {
        return await ClaudeProvider.generateTitle(
          message,
          options.anthropicKey,
        );
      } catch (e) {}
    }
    return "New Chat";
  }
}
