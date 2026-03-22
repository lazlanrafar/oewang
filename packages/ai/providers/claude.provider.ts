import Anthropic from "@anthropic-ai/sdk";
import { ChatMessage, ChatResponse } from "../types";

export abstract class ClaudeProvider {
  static async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    apiKey: string,
    tools?: any[],
    onToolCall?: (name: string, args: any) => Promise<any>
  ): Promise<ChatResponse> {
    const client = new Anthropic({ apiKey });
    let requestMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [
            { type: "text", text: m.content as string },
          ];
          for (const attachment of m.attachments) {
            if (attachment.type.startsWith("image/")) {
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: attachment.type as any,
                  data: attachment.data,
                },
              });
            }
          }
          return { role: "user", content };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content as string,
        } as Anthropic.MessageParam;
      });

    let response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools as any[],
      messages: requestMessages,
    });

    while (response.stop_reason === "tool_use" && onToolCall) {
      requestMessages.push({ role: "assistant", content: response.content });
      const toolResultsMsg: Anthropic.MessageParam = { role: "user", content: [] };

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const toolResult = await onToolCall(block.name, block.input);
          (toolResultsMsg.content as any[]).push({ 
            type: "tool_result", 
            tool_use_id: block.id, 
            content: JSON.stringify(toolResult) 
          });
        }
      }
      requestMessages.push(toolResultsMsg);
      response = await client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools as any[],
        messages: requestMessages,
      });
    }

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    const reply = textBlock ? textBlock.text : "I couldn't generate a response.";

    return { 
      reply, 
      usage: { 
        input_tokens: response.usage.input_tokens, 
        output_tokens: response.usage.output_tokens 
      } 
    };
  }

  static async generateTitle(message: string, apiKey: string): Promise<string> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 20,
      system: "Generate a very short (max 4 words) title summarizing the user's message. Output ONLY the title, no quotes or extra text.",
      messages: [{ role: "user", content: message }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return textBlock ? textBlock.text.trim().replace(/^['"]|['"]$/g, "") : "New Chat";
  }
}
