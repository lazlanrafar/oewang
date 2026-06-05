import {
  and,
  db,
  eq,
  isNull,
  sql,
  vaultFileChunks,
  vaultFiles,
} from "@workspace/database";

export interface RagSearchResult {
  chunkId: string;
  fileId: string;
  fileName: string;
  content: string;
  similarity: number;
  chunkIndex: number;
}

export abstract class RagRepository {
  /**
   * Find the most similar chunks to a query embedding.
   * Uses cosine distance (pgvector <=> operator).
   */
  static async similaritySearch(
    workspaceId: string,
    queryEmbedding: number[],
    limit = 5,
    minSimilarity = 0.3,
  ): Promise<RagSearchResult[]> {
    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    const rows = await db
      .select({
        chunkId: vaultFileChunks.id,
        fileId: vaultFileChunks.vault_file_id,
        fileName: vaultFiles.name,
        content: vaultFileChunks.content,
        chunkIndex: vaultFileChunks.chunk_index,
        similarity: sql<number>`1 - (${vaultFileChunks.embedding} <=> ${sql.raw(`'${embeddingLiteral}'::vector`)})`,
      })
      .from(vaultFileChunks)
      .leftJoin(vaultFiles, eq(vaultFileChunks.vault_file_id, vaultFiles.id))
      .where(
        and(
          eq(vaultFileChunks.workspace_id, workspaceId),
          isNull(vaultFileChunks.deleted_at),
          isNull(vaultFiles.deletedAt),
        ),
      )
      .orderBy(
        sql`${vaultFileChunks.embedding} <=> ${sql.raw(`'${embeddingLiteral}'::vector`)}`,
      )
      .limit(limit);

    return rows
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => ({
        chunkId: r.chunkId,
        fileId: r.fileId ?? "",
        fileName: r.fileName ?? "Unknown file",
        content: r.content,
        similarity: r.similarity,
        chunkIndex: r.chunkIndex,
      }));
  }

  /** Delete all chunks for a vault file (called when file is deleted). */
  static async deleteByFileId(vaultFileId: string) {
    await db
      .update(vaultFileChunks)
      .set({ deleted_at: new Date() })
      .where(eq(vaultFileChunks.vault_file_id, vaultFileId));
  }

  /** Count indexed chunks for a workspace. */
  static async countByWorkspace(workspaceId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vaultFileChunks)
      .where(
        and(
          eq(vaultFileChunks.workspace_id, workspaceId),
          isNull(vaultFileChunks.deleted_at),
        ),
      );
    return Number(row?.count ?? 0);
  }
}
