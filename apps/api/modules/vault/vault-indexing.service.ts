import { and, db, eq, isNull, vaultFileChunks } from "@workspace/database";
import { createLogger } from "@workspace/logger";
import { AiSidecarClient } from "../ai/ai-sidecar-client";

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
    // Embedding happens in the Python sidecar (it holds OPENAI_API_KEY), so the API
    // no longer needs the key — just forwards the file.
    log.info("VaultIndexingService: starting indexing", {
      vaultFileId,
      mimeType,
      fileName,
    });

    try {
      // 1. Extract + chunk + embed in the Python sidecar (DB write stays here).
      const { indexable, chunks } = await AiSidecarClient.chunkFile(
        buffer.toString("base64"),
        mimeType,
        fileName,
      );
      if (!indexable) {
        log.debug("VaultIndexingService: file type not indexable, skipping", {
          mimeType,
          vaultFileId,
        });
        return;
      }
      if (!chunks.length) {
        log.info("VaultIndexingService: no usable chunks extracted", {
          vaultFileId,
        });
        return;
      }

      log.info("VaultIndexingService: chunks created", {
        vaultFileId,
        count: chunks.length,
      });

      // 2. Delete any previous chunks for this file (re-indexing case)
      await db
        .update(vaultFileChunks)
        .set({ deleted_at: new Date() })
        .where(
          and(
            eq(vaultFileChunks.vault_file_id, vaultFileId),
            isNull(vaultFileChunks.deleted_at),
          ),
        );

      // 3. Persist chunks + embeddings
      const rows = chunks.map((chunk) => ({
        vault_file_id: vaultFileId,
        workspace_id: workspaceId,
        content: chunk.content,
        embedding: chunk.embedding ?? null,
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
