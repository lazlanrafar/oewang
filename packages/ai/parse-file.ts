import * as XLSX from "xlsx";
import type { AiInput } from "./types";

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const TEXT_MIME = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "application/csv",
]);

const EXCEL_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream", // .xlsx sometimes comes as this
]);

/**
 * Converts a raw file buffer + mime type into the correct AiInput shape.
 * Images and PDFs become base64; tabular data becomes CSV text.
 */
export function parseFileToAiInput(
  buffer: Buffer | Uint8Array,
  mimeType: string,
  filename: string,
): AiInput {
  const normalizedMime = (mimeType.toLowerCase().split(";")[0] ?? "").trim();
  const ext = (filename.split(".").pop() ?? "").toLowerCase();

  // ── Images → base64 vision ─────────────────────────────────────────────
  if (IMAGE_MIME.has(normalizedMime)) {
    return {
      base64: Buffer.from(buffer).toString("base64"),
      mimeType: normalizedMime,
    };
  }

  // ── PDF → base64 vision ────────────────────────────────────────────────
  if (normalizedMime === "application/pdf" || ext === "pdf") {
    return {
      base64: Buffer.from(buffer).toString("base64"),
      mimeType: "application/pdf",
    };
  }

  // ── Excel → Tabular sample ─────────────────────────────────────────────
  if (EXCEL_MIME.has(normalizedMime) || ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName ?? ""];
    if (!sheet) return {};

    const rawRows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
    if (rawRows.length === 0) return {};

    const headers =
      (rawRows[0] as string[])?.map((h) => String(h).trim()) ?? [];
    const sampleRows = rawRows.slice(1, 6).map((row: any) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    return {
      tabular: {
        headers,
        rows: sampleRows,
      },
      // Pass the full text representation in case it's small, but we rely on tabular
      fullBuffer: buffer, // We need to keep the buffer to parse the rest later if needed
    } as any; // Hack to pass the buffer back through the AiInput type without adding it globally
  }

  // ── Plain text / CSV / TSV → Tabular sample ────────────────────────────
  const textStr = Buffer.from(buffer).toString("utf-8");
  const workbook = XLSX.read(textStr, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName ?? ""];
  if (!sheet) return {};

  const rawRows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
  if (rawRows.length === 0) return {};

  const headers = (rawRows[0] as string[])?.map((h) => String(h).trim()) ?? [];
  const sampleRows = rawRows.slice(1, 6).map((row: any) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });

  return {
    tabular: {
      headers,
      rows: sampleRows,
    },
    fullBuffer: buffer,
  } as any;
}
