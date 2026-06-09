export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

const CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between consecutive chunks

// Rough token estimate: 1 token ≈ 4 characters for English/mixed text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitOnSentences(text: string, maxLen: number): string[] {
  const sentenceEnd = /([.!?。！？])\s+/g;
  const parts: string[] = [];
  let last = 0;
  let current = "";

  let match: RegExpExecArray | null;
  while ((match = sentenceEnd.exec(text)) !== null) {
    const sentence = text.slice(last, match.index + match[0].length);
    if (current.length + sentence.length > maxLen && current.length > 0) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
    last = match.index + match[0].length;
  }

  // Remainder
  const tail = text.slice(last);
  if (tail) current += tail;
  if (current.trim()) parts.push(current.trim());

  return parts;
}

export abstract class ChunkingService {
  /**
   * Split text into overlapping chunks suitable for embedding.
   * Tries to break on sentence boundaries within each chunk.
   */
  static chunk(text: string): TextChunk[] {
    const cleaned = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!cleaned) return [];

    const chunks: TextChunk[] = [];
    let pos = 0;
    let index = 0;

    while (pos < cleaned.length) {
      const end = Math.min(pos + CHUNK_SIZE, cleaned.length);
      let slice = cleaned.slice(pos, end);

      // If not at the end, try to break at a word boundary
      if (end < cleaned.length) {
        const lastSpace = slice.lastIndexOf(" ");
        const lastNewline = slice.lastIndexOf("\n");
        const breakAt = Math.max(lastSpace, lastNewline);
        if (breakAt > CHUNK_SIZE / 2) {
          slice = slice.slice(0, breakAt);
        }
      }

      const content = slice.trim();
      if (content) {
        chunks.push({ content, index, tokenCount: estimateTokens(content) });
        index++;
      }

      pos += slice.length - CHUNK_OVERLAP;
      if (pos <= 0) break; // guard against infinite loop on tiny texts
    }

    return chunks;
  }

  /**
   * Parse a supported file type to plain text.
   * Returns null for unsupported types (images, etc.).
   */
  static async extractText(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<string | null> {
    const type = mimeType.toLowerCase();

    // Plain text variants
    if (
      type.startsWith("text/") ||
      type === "application/json" ||
      type === "application/xml"
    ) {
      return buffer.toString("utf-8");
    }

    // PDF
    if (type === "application/pdf") {
      try {
        const { PDFExtract } = await import("pdf.js-extract");
        const extractor = new PDFExtract();
        const data = await extractor.extractBuffer(buffer, {});
        return data.pages
          .map((p: any) => p.content.map((c: any) => c.str).join(" "))
          .join("\n\n")
          .trim();
      } catch (e) {
        return null;
      }
    }

    // Excel / CSV
    if (
      type === "application/vnd.ms-excel" ||
      type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      type === "text/csv"
    ) {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "buffer" });
        const lines: string[] = [];
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          if (!ws) continue;
          const csv = XLSX.utils.sheet_to_csv(ws);
          lines.push(`[Sheet: ${sheetName}]\n${csv}`);
        }
        return lines.join("\n\n").trim();
      } catch {
        return null;
      }
    }

    return null; // Images, binary, etc. — skip
  }

  static isIndexable(mimeType: string): boolean {
    const t = mimeType.toLowerCase();
    return (
      t.startsWith("text/") ||
      t === "application/pdf" ||
      t === "application/json" ||
      t === "application/xml" ||
      t === "application/vnd.ms-excel" ||
      t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  }
}
