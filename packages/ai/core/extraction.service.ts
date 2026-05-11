import { ProviderFactory } from "../providers/provider.factory";
import { SYSTEM_PROMPT_BASE } from "./prompts";
import type { AiInput, ExtractedTransaction } from "../types";
import OpenAI from "openai";

const OPENAI_EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";

export abstract class ExtractionService {
  /**
   * Extract transactions from tabular data (CSV/XLSX).
   */
  static async extractTransactions(
    input: AiInput,
    walletNames: string[],
    categoryNames: string[],
    keys: { geminiKey?: string; openaiKey?: string; anthropicKey?: string }
  ): Promise<ExtractedTransaction[]> {
    if (!input.tabular || input.tabular.rows.length === 0) {
      return [];
    }

    const prompt = `
You are a financial data extraction tool.
Extract transactions from the following tabular data (CSV/Excel rows).

Valid Wallets (Account Names):
${walletNames.map((w) => `- ${w}`).join("\n")}

Valid Categories:
${categoryNames.map((c) => `- ${c}`).join("\n")}

Rules:
- Extract up to 100 rows.
- Match walletName against the provided wallet list whenever possible.
- Match categoryName against the provided category list whenever possible.
- Use ISO 8601 dates.
- Ignore rows that are clearly headers, totals, separators, or blank.

Tabular Data:
${JSON.stringify(input.tabular.rows.slice(0, 100))}
    `.trim();

    try {
      if (keys.openaiKey) {
        const openai = new OpenAI({
          apiKey: keys.openaiKey,
          timeout: 30_000,
          maxRetries: 2,
        });
        const response = await openai.responses.create({
          model: OPENAI_EXTRACTION_MODEL,
          input: prompt,
          truncation: "auto",
          max_output_tokens: 2000,
          text: {
            format: {
              type: "json_schema",
              name: "extracted_transactions",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        amount: { type: "number" },
                        date: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["income", "expense", "transfer"],
                        },
                        walletName: { type: ["string", "null"] },
                        categoryName: { type: ["string", "null"] },
                        description: { type: ["string", "null"] },
                      },
                      required: ["name", "amount", "date", "type", "walletName", "categoryName", "description"],
                    },
                  },
                },
                required: ["transactions"],
              },
            },
          },
          store: false,
        });

        const parsed = JSON.parse(response.output_text || '{"transactions":[]}');
        return Array.isArray(parsed.transactions) ? parsed.transactions : [];
      }

      const response = await ProviderFactory.chat(
        [{ role: "user", content: prompt }], // User message only, system prompt passsed separately
        SYSTEM_PROMPT_BASE,
        keys
      );

      // Extract JSON from response
      const jsonStr = response.reply.trim().replace(/```json|```/g, "");
      const result = JSON.parse(jsonStr);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error("[ExtractionService Error]:", error);
      return [];
    }
  }
}
