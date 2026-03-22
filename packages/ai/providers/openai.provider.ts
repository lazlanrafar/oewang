import OpenAI from "openai";
import { ChatMessage, ChatResponse } from "../types";

export abstract class OpenAIProvider {
  static async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    apiKey: string,
    tools?: any[],
    onToolCall?: (name: string, args: any) => Promise<any>
  ): Promise<ChatResponse> {
    const openai = new OpenAI({ apiKey });

    const openAiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as any,
      },
    }));

    let requestMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const content: OpenAI.Chat.ChatCompletionContentPart[] = [
            { type: "text", text: m.content as string },
          ];
          for (const attachment of m.attachments) {
            if (attachment.type.startsWith("image/")) {
              content.push({
                type: "image_url",
                image_url: {
                  url: `data:${attachment.type};base64,${attachment.data}`,
                },
              });
            }
          }
          return { role: m.role as "user", content };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content as string,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }),
    ];

    let completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: requestMessages,
      tools: openAiTools,
    });

    let choice = completion.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");
    let currentMessage = choice.message;

    while (currentMessage.tool_calls && currentMessage.tool_calls.length > 0 && onToolCall) {
      requestMessages.push(currentMessage);
      for (const toolCall of currentMessage.tool_calls) {
        if ("function" in toolCall) {
          const toolResult = await onToolCall(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
          );
          requestMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }
      }
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: requestMessages,
        tools: openAiTools,
      });
      choice = completion.choices[0];
      if (!choice) throw new Error("OpenAI returned no choices during tool use");
      currentMessage = choice.message;
    }

    const reply = currentMessage.content || "I couldn't generate a response.";

    return {
      reply,
      usage: {
        input_tokens: completion.usage?.prompt_tokens ?? 0,
        output_tokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  static async generateTitle(message: string, apiKey: string): Promise<string> {
    const prompt = `Generate a very short (max 4 words) title summarizing the user's message. Output ONLY the title, no quotes or extra text.\n\nMessage: ${message}`;
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
    });
    return response.choices[0]?.message.content?.trim().replace(/^['"]|['"]$/g, "") || "New Chat";
  }
}
