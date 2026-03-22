import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { ChatMessage, ChatResponse } from "../types";
import { log } from "../utils/logger";

export abstract class GeminiProvider {
  static async chat(
    messages: ChatMessage[],
    systemPrompt: string,
    apiKey: string,
    tools?: any[],
    onToolCall?: (name: string, args: any) => Promise<any>
  ): Promise<ChatResponse> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: systemPrompt,
      tools: tools ? [{
        // @ts-ignore
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        }))
      }] : undefined
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content as string }]
      }))
    });

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.content) throw new Error("No content in last message");

    let parts: Part[] = [{ text: lastMsg.content as string }];
    if (lastMsg.attachments && lastMsg.attachments.length > 0) {
      for (const attachment of lastMsg.attachments) {
        if (attachment.type.startsWith("image/")) {
          parts.push({
            inlineData: {
              mimeType: attachment.type,
              data: attachment.data,
            },
          });
        }
      }
    }

    let result = await chat.sendMessage(parts);
    let response = result.response;
    let call = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall,
    );

    while (call && onToolCall) {
      const toolResult = await onToolCall(
        call.functionCall!.name,
        call.functionCall!.args,
      );
      result = await chat.sendMessage([
        {
          functionResponse: {
            name: call.functionCall!.name,
            response: toolResult,
          },
        },
      ]);
      response = result.response;
      call = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.functionCall,
      );
    }

    const text = response.text();
    if (!text) throw new Error("Gemini returned empty response");

    return {
      reply: text,
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  static async generateTitle(message: string, apiKey: string): Promise<string> {
    const prompt = `Generate a very short (max 4 words) title summarizing the user's message. Output ONLY the title, no quotes or extra text.\n\nMessage: ${message}`;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/^['"]|['"]$/g, "");
  }
}
