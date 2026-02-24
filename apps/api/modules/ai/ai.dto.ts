import { t } from "elysia";

export const ChatMessageDto = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String({ minLength: 1 }),
});

export const ChatRequestDto = t.Object({
  messages: t.Array(ChatMessageDto, { minItems: 1 }),
});

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
};

export type ChatResponse = {
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};
