import * as xlsx from "xlsx";
import type { AiInput } from "../types";

/**
 * Specifically for tabular data (CSV/XLSX) extraction.
 * Other file types (image/pdf) are handled by the receipt service.
 */
export function parseFileToAiInput(
  buffer: Buffer | Uint8Array,
  mimeType: string,
  filename?: string
): AiInput {
  const isTabular =
    mimeType === "text/csv" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filename?.endsWith(".csv") ||
    filename?.endsWith(".xlsx");

  if (isTabular) {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return {};

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return {};

    const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet);
    const firstRow = rows[0];
    const headers = firstRow ? Object.keys(firstRow) : [];

    return {
      tabular: {
        headers,
        rows,
      },
    };
  }

  // Not tabular - could be image or pdf text (handled elsewhere)
  return {
    fullBuffer: buffer,
    mimeType,
  };
}
