import { t } from "elysia";

export const ChatMessageDto = t.Object({
  role: t.Union([
    t.Literal("user"),
    t.Literal("assistant"),
    t.Literal("system"),
  ]),
  content: t.String({ minLength: 1 }),
  attachments: t.Optional(t.Array(t.Object({
    name: t.String(),
    type: t.String(),
    data: t.String(), // Base64
  }))),
});

export const ChatRequestDto = t.Object({
  sessionId: t.Optional(t.String()),
  messages: t.Array(ChatMessageDto, { minItems: 1 }),
});

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: {
    name: string;
    type: string;
    data: string;
  }[];
};

export type ChatRequest = {
  sessionId?: string;
  messages: ChatMessage[];
};

export type ChatResponse = {
  sessionId?: string;
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

export const ParseReceiptDto = t.Object({
  file: t.Object({
    name: t.String(),
    type: t.String(),
    data: t.String(), // Base64
  }),
});
