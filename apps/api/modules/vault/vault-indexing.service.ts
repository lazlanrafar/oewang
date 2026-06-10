import { ChunkingService, EmbeddingService } from "@workspace/ai";
import { Env } from "@workspace/constants";
import { db, vaultFileChunks, eq, isNull, and } from "@workspace/database";
import { createLogger } from "@workspace/logger";

const log = createLogger("vault-indexing");

export abstract class VaultIndexingService {
  /**
   * Index a vault file from an in-memory buffer.
   * Call this immediately after upload — the buffer is already in memory.
   * Runs async; errors are logged, not thrown.
   */
  static async indexBuffer(
    workspaceId: string,
    vaultFileId: string,
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<void> {
    if (!Env.OPENAI_API_KEY) {
      log.warn(
        "VaultIndexingService: OPENAI_API_KEY not set — skipping indexing",
        { vaultFileId },
      );
      return;
    }

    if (!ChunkingService.isIndexable(mimeType)) {
      log.debug("VaultIndexingService: file type not indexable, skipping", {
        mimeType,
        vaultFileId,
      });
      return;
    }

    log.info("VaultIndexingService: starting indexing", {
      vaultFileId,
      mimeType,
      fileName,
    });

    try {
      // 1. Extract text
      const text = await ChunkingService.extractText(
        buffer,
        mimeType,
        fileName,
      );
      if (!text || text.trim().length < 50) {
        log.info("VaultIndexingService: no usable text extracted", {
          vaultFileId,
        });
        return;
      }

      // 2. Chunk text
      const chunks = ChunkingService.chunk(text);
      if (!chunks.length) return;

      log.info("VaultIndexingService: chunks created", {
        vaultFileId,
        count: chunks.length,
      });

      // 3. Delete any previous chunks for this file (re-indexing case)
      await db
        .update(vaultFileChunks)
        .set({ deleted_at: new Date() })
        .where(
          and(
            eq(vaultFileChunks.vault_file_id, vaultFileId),
            isNull(vaultFileChunks.deleted_at),
          ),
        );

      // 4. Generate embeddings in batch
      const embeddings = await EmbeddingService.embed(
        chunks.map((c) => c.content),
        Env.OPENAI_API_KEY,
      );

      // 5. Persist chunks + embeddings
      const rows = chunks.map((chunk, i) => ({
        vault_file_id: vaultFileId,
        workspace_id: workspaceId,
        content: chunk.content,
        embedding: embeddings[i] ?? null,
        chunk_index: chunk.index,
        token_count: chunk.tokenCount,
      }));

      // Insert in batches of 50 to avoid hitting Postgres parameter limits
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        await db.insert(vaultFileChunks).values(rows.slice(i, i + BATCH));
      }

      log.info("VaultIndexingService: indexing complete", {
        vaultFileId,
        chunks: rows.length,
      });
    } catch (error: any) {
      log.error("VaultIndexingService: indexing failed", {
        vaultFileId,
        error: error?.message ?? String(error),
      });
    }
  }
}
