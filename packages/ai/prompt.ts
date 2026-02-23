import type { ExtractedTransaction, CsvMappingConfig } from "./types";

/**
 * Builds the system + user prompt for transaction extraction.
 * The AI is asked to return a strict JSON array only.
 */
export function buildExtractionPrompt(
  walletNames: string[],
  categoryNames: string[],
) {
  const wallets = walletNames.length ? walletNames.join(", ") : "none";
  const categories = categoryNames.length ? categoryNames.join(", ") : "none";

  const system = `You are a precise financial data-extraction assistant.
Your only job is to read the provided document and extract a list of financial transactions.

Rules:
- Return ONLY a valid JSON array. No prose, no markdown, no code fences.
- Each element must conform exactly to this TypeScript type:
  {
    name?: string;          // short label or merchant name
    amount: number;         // always positive
    date: string;           // ISO format: yyyy-MM-dd
    type: "income" | "expense" | "transfer";
    walletName?: string;    // must be one of: ${wallets}
    categoryName?: string;  // must be one of: ${categories}
    description?: string;   // any extra detail from the document
  }
- If a field cannot be determined, omit it.
- If the date is ambiguous, default to today (${new Date().toISOString().slice(0, 10)}).
- If type is ambiguous, default to "expense".
- Do NOT invent amounts or dates that are not in the document.
- If no transactions are found, return an empty array: []`;

  return system;
}

export function buildMappingPrompt() {
  return `You are a data mapping assistant. I will provide you with the headers and first 5 rows of a financial spreadsheet/CSV.
Your job is to identify which columns correspond to the standard transaction fields and return ONLY a JSON object that maps them.

Rules:
- Return ONLY valid JSON matching this schema:
  {
    "amountColumn": string, // The exact name of the column containing the money amount
    "dateColumn": string,   // The exact name of the column containing the date
    "nameColumn": string,   // The exact name of the column containing the merchant/description
    "categoryColumn"?: string, // The exact name of the category column (if exists, else omit)
    "typeLogic": string     // Logic to determine if it's an expense. Typically: "if Amount < 0 then expense", or "if Type == 'Debit' then expense"
  }
- No prose, no code fences. JSON ONLY.`;
}

/** JSON schema hint for mapping output mode (OpenAI) */
export const MAPPING_SCHEMA = {
  name: "mapping",
  strict: true,
  schema: {
    type: "object",
    properties: {
      amountColumn: { type: "string" },
      dateColumn: { type: "string" },
      nameColumn: { type: "string" },
      categoryColumn: { type: "string" },
      typeLogic: { type: "string" },
    },
    required: ["amountColumn", "dateColumn", "nameColumn", "typeLogic"],
    additionalProperties: false,
  },
} as const;

/** JSON schema hint for structured output mode (OpenAI) */
export const EXTRACTION_SCHEMA = {
  name: "transactions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            amount: { type: "number" },
            date: { type: "string" },
            type: { type: "string", enum: ["income", "expense", "transfer"] },
            walletName: { type: "string" },
            categoryName: { type: "string" },
            description: { type: "string" },
          },
          required: ["amount", "date", "type"],
          additionalProperties: false,
        },
      },
    },
    required: ["transactions"],
    additionalProperties: false,
  },
} as const;

/** Parse raw AI output (JSON string or object) into a mapping config */
export function parseMappingOutput(raw: string): CsvMappingConfig | null {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.amountColumn || !parsed.dateColumn || !parsed.nameColumn)
      return null;
    return parsed as CsvMappingConfig;
  } catch {
    return null;
  }
}

/** Parse raw AI output (JSON string or object) into an array */
export function parseAiOutput(raw: string): ExtractedTransaction[] {
  // Strip any accidental markdown fences
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Support both \`[...]\` and \`{ transactions: [...] }\`
    const arr = Array.isArray(parsed) ? parsed : (parsed?.transactions ?? []);
    return arr.filter(
      (t: any) => typeof t.amount === "number" && typeof t.date === "string",
    );
  } catch {
    return [];
  }
}
