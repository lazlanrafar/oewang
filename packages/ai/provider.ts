import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AiInput, ExtractedTransaction } from "./types";
import {
  buildExtractionPrompt,
  buildMappingPrompt,
  EXTRACTION_SCHEMA,
  MAPPING_SCHEMA,
  parseAiOutput,
  parseMappingOutput,
} from "./prompt";
import * as XLSX from "xlsx";
import { Env } from "@workspace/constants";

export type AiProviderName = "openai" | "claude" | "none";

/** Detect which provider to use based on available env keys */
export function detectProvider(): AiProviderName {
  if (Env.OPENAI_API_KEY) return "openai";
  if (Env.ANTHROPIC_API_KEY) return "claude";
  return "none";
}

export class AiProvider {
  static async extractTransactions(
    input: AiInput,
    walletNames: string[],
    categoryNames: string[],
  ): Promise<ExtractedTransaction[]> {
    const provider = detectProvider();

    if (provider === "none") {
      throw new Error(
        "No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.",
      );
    }

    // ── Route 1: Tabular Mapping Strategy ────────────────────────────────
    if (input.tabular && input.fullBuffer) {
      const systemPrompt = buildMappingPrompt();
      const sampleJson = JSON.stringify(input.tabular, null, 2);

      let mappingConfig;
      if (provider === "openai") {
        mappingConfig = await AiProvider._extractMappingWithOpenAI(
          sampleJson,
          systemPrompt,
        );
      } else {
        mappingConfig = await AiProvider._extractMappingWithClaude(
          sampleJson,
          systemPrompt,
        );
      }

      if (!mappingConfig) {
        throw new Error(
          "AI failed to generate a valid mapping configuration for this tabular file.",
        );
      }

      // Execute local parser using the received mapping config
      return AiProvider._parseTabularLocally(
        input.fullBuffer,
        mappingConfig,
        walletNames,
        categoryNames,
      );
    }

    // ── Route 2: Direct Extraction (Images, PDF, Plain Text) ─────────────
    const systemPrompt = buildExtractionPrompt(walletNames, categoryNames);

    if (provider === "openai") {
      return AiProvider._extractWithOpenAI(input, systemPrompt);
    }
    return AiProvider._extractWithClaude(input, systemPrompt);
  }

  // ── Tabular Local Parser ───────────────────────────────────────────────

  private static _parseTabularLocally(
    buffer: Buffer | Uint8Array,
    mapping: NonNullable<
      Awaited<ReturnType<typeof AiProvider._extractMappingWithOpenAI>>
    >,
    walletNames: string[],
    categoryNames: string[],
  ): ExtractedTransaction[] {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName ?? ""];
    if (!sheet) return [];

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    const results: ExtractedTransaction[] = [];

    // Helper to evaluate simple type logic (e.g. "if Amount < 0 then expense")
    const determineType = (
      row: Record<string, any>,
      rawAmount: number,
      columnMatch: string,
    ): "income" | "expense" | "transfer" => {
      const logic = mapping.typeLogic.toLowerCase();
      const colLower = columnMatch.toLowerCase();

      if (logic.includes("< 0") && rawAmount < 0) return "expense";
      if (logic.includes("> 0") && rawAmount > 0) return "income";

      if (
        colLower.includes("withdraw") ||
        colLower.includes("debit") ||
        colLower.includes("payment") ||
        colLower.includes("out")
      ) {
        return "expense";
      }

      if (
        colLower.includes("deposit") ||
        colLower.includes("credit") ||
        colLower.includes("in")
      ) {
        return "income";
      }

      // Check for explicit string markers in the row's values (e.g. "Exp." or "Income")
      const stringValues = Object.values(row)
        .map(String)
        .map((s) => s.toLowerCase());
      if (
        stringValues.some(
          (s) => s === "exp." || s === "exp" || s === "expense" || s === "out",
        )
      )
        return "expense";
      if (
        stringValues.some(
          (s) => s === "inc." || s === "inc" || s === "income" || s === "in",
        )
      )
        return "income";

      // Fallback naive guess based on amount sign
      return rawAmount < 0 ? "expense" : "income";
    };

    for (const row of rawRows) {
      if (Object.keys(row).length === 0) continue;

      let rawAmount = Number(row[mapping.amountColumn]);
      let matchedColumn = mapping.amountColumn;

      // Handle split columns like "Withdrawals" and "Deposits"
      if (
        isNaN(rawAmount) ||
        rawAmount === 0 ||
        row[mapping.amountColumn] === undefined
      ) {
        const possibleCols = Object.keys(row).filter(
          (c) =>
            c !== mapping.dateColumn &&
            c !== mapping.nameColumn &&
            c !== mapping.categoryColumn &&
            typeof row[c] === "number",
        );
        if (possibleCols.length > 0) {
          matchedColumn = possibleCols[0]!;
          rawAmount = Number(row[matchedColumn]);
        }
      }

      if (
        isNaN(rawAmount) ||
        rawAmount === 0 ||
        row[matchedColumn] === undefined
      )
        continue;

      let dateStr = String(row[mapping.dateColumn] || "");
      // XLSX numeric dates -> ISO string
      if (typeof row[mapping.dateColumn] === "number") {
        const d = new Date(
          Math.round((row[mapping.dateColumn] - 25569) * 86400 * 1000),
        );
        dateStr = d.toISOString().split("T")[0] ?? "";
      } else {
        // rough attempt to convert "MM/DD/YYYY" or "DD/MM/YYYY" to ISO
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split("T")[0] ?? "";
        } else {
          dateStr = new Date().toISOString().slice(0, 10); // fallback today
        }
      }

      let name = String(row[mapping.nameColumn] || "");

      // Fallback for tricky sheets (like duplicate column names) where the mapped name is empty or numeric
      if (!name || name === "undefined" || !isNaN(Number(name))) {
        const possibleNameCols = Object.keys(row).filter((c) => {
          const cLower = c.toLowerCase();
          return (
            cLower.includes("note") ||
            cLower.includes("desc") ||
            cLower.includes("memo") ||
            cLower.includes("merchant")
          );
        });
        if (possibleNameCols.length > 0) {
          name = String(row[possibleNameCols[0]!]);
        } else {
          name = String(row[Object.keys(row)[0]!] || "Unknown");
        }
      }

      name = name.slice(0, 100);

      const categoryName = mapping.categoryColumn
        ? String(row[mapping.categoryColumn] || "")
        : undefined;

      // Ensure amount is strictly positive as required by the schema
      const absAmount = Math.abs(rawAmount);
      const type = determineType(row, rawAmount, matchedColumn);

      results.push({
        amount: absAmount,
        date: dateStr,
        name,
        type,
        categoryName: categoryName ? categoryName : undefined,
        // No AI to guess wallet for each row in local mode, rely on default fallback in service
      });
    }

    return results;
  }

  // ── OpenAI GPT-4o ───────────────────────────────────────────────────────

  private static async _extractWithOpenAI(
    input: AiInput,
    systemPrompt: string,
  ): Promise<ExtractedTransaction[]> {
    const client = new OpenAI({ apiKey: Env.OPENAI_API_KEY });

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (input.base64 && input.mimeType) {
      if (input.mimeType === "application/pdf") {
        // GPT-4o supports PDF via file upload as base64 in data URL
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${input.mimeType};base64,${input.base64}`,
            detail: "high",
          },
        });
      } else {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${input.mimeType};base64,${input.base64}`,
            detail: "high",
          },
        });
      }
      userContent.push({
        type: "text",
        text: "Extract all financial transactions from this document. Return JSON only.",
      });
    } else {
      userContent.push({
        type: "text",
        text: `Extract all financial transactions from this data:\n\n${JSON.stringify(input.tabular, null, 2)}\n\nReturn JSON only.`,
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: {
        type: "json_schema",
        json_schema: EXTRACTION_SCHEMA,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    return parseAiOutput(raw);
  }

  private static async _extractMappingWithOpenAI(
    sampleJson: string,
    systemPrompt: string,
  ) {
    const client = new OpenAI({ apiKey: Env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: {
        type: "json_schema",
        json_schema: MAPPING_SCHEMA,
      },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this tabular data sample and generate a column mapping JSON:\n\n${sampleJson}`,
        },
      ],
      max_tokens: 1024,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    return parseMappingOutput(raw);
  }

  // ── Anthropic Claude ───────────────────────────────────────────────────

  private static async _extractWithClaude(
    input: AiInput,
    systemPrompt: string,
  ): Promise<ExtractedTransaction[]> {
    const client = new Anthropic({ apiKey: Env.ANTHROPIC_API_KEY });

    const userContent: Anthropic.MessageParam["content"] = [];

    if (input.base64 && input.mimeType) {
      const mediaType =
        input.mimeType === "application/pdf"
          ? "application/pdf"
          : (input.mimeType as Anthropic.Base64ImageSource["media_type"]);

      if (input.mimeType === "application/pdf") {
        // Claude supports PDFs as document blocks
        userContent.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: input.base64,
          },
        } as any);
      } else {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as Anthropic.Base64ImageSource["media_type"],
            data: input.base64,
          },
        });
      }
      userContent.push({
        type: "text",
        text: "Extract all financial transactions from this document. Return JSON only.",
      });
    } else {
      userContent.push({
        type: "text",
        text: `Extract all financial transactions from this data:\n\n${JSON.stringify(input.tabular, null, 2)}\n\nReturn JSON only.`,
      });
    }

    try {
      const response = await client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });

      const block = response.content.find((b) => b.type === "text");
      const raw = block?.type === "text" ? block.text : "[]";
      return parseAiOutput(raw);
    } catch (error) {
      console.error("[Claude API Error]:", error);
      throw error;
    }
  }

  private static async _extractMappingWithClaude(
    sampleJson: string,
    systemPrompt: string,
  ) {
    const client = new Anthropic({ apiKey: Env.ANTHROPIC_API_KEY });

    try {
      const response = await client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Analyze this tabular data sample and generate a column mapping JSON:\n\n${sampleJson}`,
          },
        ],
      });

      const block = response.content.find((b) => b.type === "text");
      const raw = block?.type === "text" ? block.text : "{}";
      return parseMappingOutput(raw);
    } catch (error) {
      console.error("[Claude Mapping API Error]:", error);
      throw error;
    }
  }
}
