import { ProviderFactory } from "../providers/provider.factory";
import { SYSTEM_PROMPT_BASE } from "./prompts";
import type { AiInput, ExtractedTransaction } from "../types";

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
      
      Analyze each row and return a JSON array of transactions.
      Each transaction must have:
      - name: string (merchant/description)
      - amount: number
      - date: string (ISO 8601)
      - type: "income" | "expense" | "transfer"
      - walletName: string (match from list if possible)
      - categoryName: string (match from list or pick sensible name)
      - description: string (optional)
      
      Tabular Data:
      ${JSON.stringify(input.tabular.rows.slice(0, 100))}
      
      Return ONLY a JSON array.
    `.trim();

    try {
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
