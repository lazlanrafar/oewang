import OpenAI from "openai";
import { ChatMessage, ChatResponse } from "../types";

const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
const OPENAI_TITLE_MODEL = process.env.OPENAI_TITLE_MODEL || "gpt-5.4-nano";
const OPENAI_CHAT_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_CHAT_MAX_OUTPUT_TOKENS || 1200,
);

function buildInputMessages(
  messages: ChatMessage[],
): OpenAI.Responses.ResponseInputItem[] {
  return messages.map((message) => {
    const content: OpenAI.Responses.ResponseInputMessageContentList = [
      {
        type: "input_text",
        text: message.content,
      },
    ];

    if (message.attachments && Array.isArray(message.attachments)) {
      for (const attachment of message.attachments) {
        if (attachment.type.startsWith("image/")) {
          content.push({
            type: "input_image",
            image_url: `data:${attachment.type};base64,${attachment.data}`,
            detail: "auto",
          });
        }
      }
    }

    return {
      type: "message",
      role: message.role === "assistant" ? "assistant" : "user",
      content,
    };
  });
}

function getLatestOpenAIPreviousResponseId(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    if (message.role !== "assistant") continue;

    const attachments = message.attachments;
    if (!attachments || Array.isArray(attachments)) continue;

    const provider = (attachments as any)?.provider;
    if (provider?.name === "openai" && typeof provider.response_id === "string") {
      return provider.response_id;
    }
  }

  return undefined;
}

export abstract class OpenAIProvider {
  static async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    apiKey: string,
    tools?: any[],
    onToolCall?: (name: string, args: any) => Promise<any>
  ): Promise<ChatResponse> {
    const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 });

    const openAiTools: OpenAI.Responses.Tool[] | undefined = tools?.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.input_schema as any,
      strict: true,
    }));

    const previousResponseId = getLatestOpenAIPreviousResponseId(messages);
    let input = previousResponseId
      ? buildInputMessages(messages.slice(-1))
      : buildInputMessages(messages);

    let response = await openai.responses.create({
      model: OPENAI_CHAT_MODEL,
      instructions: systemPrompt,
      input,
      tools: openAiTools,
      previous_response_id: previousResponseId,
      truncation: "auto",
      max_output_tokens: OPENAI_CHAT_MAX_OUTPUT_TOKENS,
      store: true,
      parallel_tool_calls: false,
    });

    while (onToolCall) {
      const toolCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call",
      );

      if (toolCalls.length === 0) break;

      const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];
      for (const toolCall of toolCalls) {
        const toolResult = await onToolCall(
          toolCall.name,
          JSON.parse(toolCall.arguments || "{}"),
        );
        toolOutputs.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(toolResult),
        });
      }

      response = await openai.responses.create({
        model: OPENAI_CHAT_MODEL,
        instructions: systemPrompt,
        input: toolOutputs,
        tools: openAiTools,
        previous_response_id: response.id,
        truncation: "auto",
        max_output_tokens: OPENAI_CHAT_MAX_OUTPUT_TOKENS,
        store: true,
        parallel_tool_calls: false,
      });
    }

    const reply = response.output_text || "I couldn't generate a response.";

    return {
      reply,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
        cached_input_tokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        reasoning_tokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      },
      provider: {
        name: "openai",
        response_id: response.id,
        request_id: response._request_id ?? undefined,
      },
    };
  }

  static async generateTitle(message: string, apiKey: string): Promise<string> {
    const prompt = `Generate a very short (max 4 words) title summarizing the user's message. Output only the title, with no quotes or extra text.\n\nMessage: ${message}`;
    const openai = new OpenAI({ apiKey, timeout: 15_000, maxRetries: 2 });
    const response = await openai.responses.create({
      model: OPENAI_TITLE_MODEL,
      input: prompt,
      max_output_tokens: 20,
      truncation: "auto",
      store: false,
    });
    return response.output_text.trim().replace(/^['"]|['"]$/g, "") || "New Chat";
  }
}
