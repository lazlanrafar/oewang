import { t, type Static } from "elysia";

export type Intent =
  | "transaction_query"
  | "debt_query"
  | "wallet_query"
  | "analytics_query"
  | "create_transaction"
  | "create_debt"
  | "split_bill"
  | "general";

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: {
    name: string;
    type: string;
    data: string; // Base64
  }[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatResponse {
  sessionId?: string;
  reply: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ParsedReceipt {
  amount: number;
  date: string;
  name: string;
  categoryId: string;
}

/** Shape the AI is expected to return for each transaction extraction */
export interface ExtractedTransaction {
  name?: string;
  amount: number;
  date: string;
  type: "income" | "expense" | "transfer";
  walletName?: string;
  categoryName?: string;
  description?: string;
}

export interface AiInput {
  tabular?: {
    headers: string[];
    rows: Record<string, any>[];
  };
  fullBuffer?: Buffer | Uint8Array;
  base64?: string;
  mimeType?: string;
}

export interface CsvMappingConfig {
  walletId?: string;
  categoryId?: string;
  type?: "income" | "expense" | "transfer";
  dateColumn?: string;
  amountColumn?: string;
  nameColumn?: string;
  categoryColumn?: string;
}
