/** Shape the AI is expected to return for each transaction */
export interface ExtractedTransaction {
  /** Short label / merchant name */
  name?: string;
  /** Amount as a positive number */
  amount: number;
  /** ISO date string yyyy-MM-dd */
  date: string;
  /** income | expense | transfer */
  type: "income" | "expense" | "transfer";
  /** Matched wallet name from the provided list */
  walletName?: string;
  /** Matched category name from the provided list */
  categoryName?: string;
  /** Rich text description / notes */
  description?: string;
}

export interface CsvMappingConfig {
  /** Column name for the amount */
  amountColumn: string;
  /** Column name for the date */
  dateColumn: string;
  /** Column name for the transaction name/description */
  nameColumn: string;
  /** Column name for the category/type (optional) */
  categoryColumn?: string;
  /** Logic or indicator to determine expense vs income (e.g. "if Amount < 0 then expense") */
  typeLogic: string;
}

export interface AiInput {
  /** For text/tabular data */
  tabular?: {
    headers: string[];
    rows: Record<string, any>[];
  };
  /** Full buffer of the tabular file to parse locally after mapping */
  fullBuffer?: Buffer | Uint8Array;
  /** For image/PDF files: base64-encoded binary */
  base64?: string;
  mimeType?: string;
}
