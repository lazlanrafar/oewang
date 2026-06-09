import OpenAI from "openai";
import { log } from "../utils/logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request

export { EMBEDDING_DIMENSIONS };

let _client: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!_client || (_client as any).apiKey !== apiKey) {
    _client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 2 });
  }
  return _client;
}

export abstract class EmbeddingService {
  /**
   * Generate embeddings for an array of texts.
   * Automatically batches requests to stay within API limits.
   */
  static async embed(texts: string[], apiKey: string): Promise<number[][]> {
    if (!texts.length) return [];

    const client = getClient(apiKey);
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map(
        (t) => t.replace(/\n/g, " ").trim().slice(0, 8191), // API limit
      );

      try {
        const response = await client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          encoding_format: "float",
        });

        for (const item of response.data) {
          embeddings.push(item.embedding);
        }

        log.debug(`EmbeddingService: embedded batch ${i / BATCH_SIZE + 1}`, {
          count: batch.length,
        });
      } catch (error: any) {
        log.error("EmbeddingService: embedding batch failed", {
          error: error?.message,
          batchStart: i,
        });
        throw error;
      }
    }

    return embeddings;
  }

  /**
   * Generate a single embedding for a search query.
   */
  static async embedQuery(query: string, apiKey: string): Promise<number[]> {
    const results = await EmbeddingService.embed([query], apiKey);
    return results[0] ?? [];
  }
}
