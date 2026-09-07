import { t } from "elysia";

// ChatMessage/ChatResponse are still used as plain types (ChatAttachment in
// ai.service.ts, Telegram's receipt-photo attachments) even though the routes
// that used to validate against ChatMessageDto/ChatRequestDto (POST /ai/chat)
// were removed once the chat money path moved fully to apps/ai.
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
  webSearch?: boolean;
};

export type ChatResponse = {
  sessionId?: string;
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens?: number;
    reasoning_tokens?: number;
  };
  artifacts?: {
    type: string;
    payload: any;
  }[];
  provider?: {
    name: "openai" | "gemini" | "anthropic";
    response_id?: string;
    request_id?: string;
  };
};

export const ParseReceiptDto = t.Object({
  file: t.Object({
    name: t.String(),
    type: t.String(),
    data: t.String(), // Base64
  }),
});
