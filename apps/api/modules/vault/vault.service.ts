import { VaultRepository } from "./vault.repository";
import { BucketClient } from "@workspace/bucket";
import { decrypt } from "@workspace/encryption";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import {
  buildPagination,
  parsePaginationQuery,
  buildError,
} from "@workspace/utils";
import type { PaginationQuery } from "@workspace/types";
import { ErrorCode } from "@workspace/types";
import { status } from "elysia";
import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { createHash } from "node:crypto";

export abstract class VaultService {
  private static bucketClientCache = new Map<string, BucketClient>();

  private static buildBucketCacheKey(workspaceId: string, settings: any) {
    return JSON.stringify({
      workspaceId,
      endpoint: settings?.r2Endpoint || Env.R2_ENDPOINT || "",
      accessKeyId: settings?.r2AccessKeyId || Env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: settings?.r2SecretAccessKey || Env.R2_SECRET_ACCESS_KEY || "",
      bucketName: settings?.r2BucketName || Env.R2_BUCKET_NAME || "",
    });
  }

  private static async getBucketClient(workspaceId: string) {
    const settings = await VaultRepository.getWorkspaceSettings(workspaceId);

    const secret = Env.ENCRYPTION_KEY || "";
    const cacheKey = VaultService.buildBucketCacheKey(workspaceId, settings);
    const cached = VaultService.bucketClientCache.get(cacheKey);
    if (cached) return cached;

    // If custom R2 settings exist, use them
    if (
      settings?.r2Endpoint &&
      settings?.r2AccessKeyId &&
      settings?.r2SecretAccessKey &&
      settings?.r2BucketName
    ) {
      const client = new BucketClient({
        endpoint: settings.r2Endpoint,
        accessKeyId: decrypt(settings.r2AccessKeyId, secret),
        secretAccessKey: decrypt(settings.r2SecretAccessKey, secret),
        bucketName: settings.r2BucketName,
      });
      VaultService.bucketClientCache.set(cacheKey, client);
      return client;
    }

    // Fallback to system bucket (from env)
    const systemEndpoint = Env.R2_ENDPOINT;
    const systemAccessKeyId = Env.R2_ACCESS_KEY_ID;
    const systemSecretAccessKey = Env.R2_SECRET_ACCESS_KEY;
    const systemBucketName = Env.R2_BUCKET_NAME;

    if (
      !systemEndpoint ||
      !systemAccessKeyId ||
      !systemSecretAccessKey ||
      !systemBucketName
    ) {
      throw new Error("R2 storage not configured");
    }

    const client = new BucketClient({
      endpoint: systemEndpoint,
      accessKeyId: systemAccessKeyId,
      secretAccessKey: systemSecretAccessKey,
      bucketName: systemBucketName,
    });
    VaultService.bucketClientCache.set(cacheKey, client);
    return client;
  }

  private static computeSha256(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  static async uploadFile(
    workspaceId: string,
    userId: string,
    file: { name: string; type: string; size: number; buffer: Buffer },
  ) {
    const usageData = await VaultRepository.getUsageAndQuota(workspaceId);

    if (!usageData)
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"),
      );

    const maxVaultMb = usageData.maxMb ?? 100;
    const usedBytes = Number(usageData.used);
    const maxBytes = maxVaultMb * 1024 * 1024;

    const bucket = await VaultService.getBucketClient(workspaceId);
    const sha256 = VaultService.computeSha256(file.buffer);
    const existingFile = await VaultRepository.findExistingByFingerprint(
      workspaceId,
      {
        sha256,
        size: file.size,
        type: file.type,
      },
    );

    const isDeduplicated = !!existingFile;
    const additionalBytes = isDeduplicated ? 0 : file.size;

    if (usedBytes + additionalBytes > maxBytes) {
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `Vault storage limit exceeded. Max: ${maxVaultMb}MB.`,
        ),
      );
    }

    // Generate unique key
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "-");
    const key = existingFile?.key || `vault/${workspaceId}/${sha256}-${safeName}`;

    if (!existingFile) {
      await bucket.upload(key, file.buffer, file.type);
    }

    const vaultEntry = await VaultRepository.create({
      workspaceId,
      name: file.name,
      key,
      size: file.size,
      type: file.type,
      metadata: {
        sha256,
        deduplicated: isDeduplicated,
        originalName: file.name,
      },
    });

    if (!vaultEntry) {
      throw status(
        500,
        buildError(
          ErrorCode.INTERNAL_ERROR,
          "Failed to save file entry to database",
        ),
      );
    }

    if (additionalBytes > 0) {
      await VaultRepository.incrementVaultSize(workspaceId, additionalBytes);
    }

    // Reset storage violation if it was set
    if (usageData.storage_violation_at) {
      await VaultRepository.updateWorkspaceSubscription(workspaceId, {
        storage_violation_at: null,
      });
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "vault.file_uploaded",
      entity: "vault_file",
      entity_id: vaultEntry.id,
      after: vaultEntry,
    });

    return {
      ...vaultEntry,
      url: await bucket.getSignedUrl(vaultEntry.key),
    };
  }

  static async listFiles(workspaceId: string, query: PaginationQuery) {
    const { limit, offset, page } = parsePaginationQuery(query);

    const [files, total] = await Promise.all([
      VaultRepository.findMany(
        workspaceId,
        limit,
        offset,
        (query as any).search,
      ),
      VaultRepository.count(workspaceId, { search: (query as any).search }),
    ]);

    const bucket = await VaultService.getBucketClient(workspaceId);

    // Provide signed URLs for each file
    const filesWithUrls = await Promise.all(
      files.map(async (file) => ({
        ...file,
        url: await bucket.getSignedUrl(file.key),
      })),
    );

    return {
      files: filesWithUrls,
      pagination: buildPagination(total, page, limit),
    };
  }

  static async deleteFile(workspaceId: string, userId: string, fileId: string) {
    const file = await VaultRepository.findById(fileId, workspaceId);
    if (!file) throw new Error("File not found");

    const bucket = await VaultService.getBucketClient(workspaceId);
    const deletedFile = await VaultRepository.delete(fileId, workspaceId);
    const activeReferences = await VaultRepository.countActiveReferencesByKey(
      workspaceId,
      file.key,
    );

    if (activeReferences === 0) {
      await bucket.delete(file.key);
      await VaultRepository.incrementVaultSize(workspaceId, -Number(file.size));
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "vault.file_deleted",
      entity: "vault_file",
      entity_id: fileId,
      before: file,
    });

    return deletedFile;
  }

  static async getDownloadUrl(workspaceId: string, fileId: string) {
    const file = await VaultRepository.findById(fileId, workspaceId);
    if (!file) throw new Error("File not found");

    const bucket = await VaultService.getBucketClient(workspaceId);
    return bucket.getSignedUrl(file.key);
  }

  static async updateTags(
    workspaceId: string,
    userId: string,
    fileId: string,
    tags: string[],
  ) {
    const before = await VaultRepository.findById(fileId, workspaceId);
    const updated = await VaultRepository.updateTags(fileId, workspaceId, tags);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "vault.file_tags_updated",
      entity: "vault_file",
      entity_id: fileId,
      before,
      after: updated,
    });

    return updated;
  }

  static async processStorageViolations() {
    const workspaces = await VaultRepository.findAllWorkspacesWithUsage();
    const now = new Date();
    const gracePeriodDays = 30;

    for (const ws of workspaces) {
      const usedMb = ws.used / (1024 * 1024);
      const isOverQuota = usedMb > ws.maxMb;

      if (isOverQuota) {
        if (!ws.storage_violation_at) {
          // Start the grace period
          await VaultRepository.updateWorkspaceSubscription(ws.workspaceId, {
            storage_violation_at: now,
          });
          logger.info(`[Vault] Started storage violation grace period for workspace ${ws.workspaceId}`);
        } else {
          // Check if grace period has expired
          const violationDate = new Date(ws.storage_violation_at);
          const diffDays = (now.getTime() - violationDate.getTime()) / (1000 * 60 * 60 * 24);

          if (diffDays > gracePeriodDays) {
            // Mark all files as inactive
            await VaultRepository.bulkSetFilesInactive(ws.workspaceId, true);
            logger.warn(`[Vault] Grace period expired. Marked files as inactive for workspace ${ws.workspaceId}`);
          }
        }
      } else {
        // Not over quota - resolve the violation if it exists
        if (ws.storage_violation_at) {
          await VaultRepository.updateWorkspaceSubscription(ws.workspaceId, {
            storage_violation_at: null,
          });
          await VaultRepository.bulkSetFilesInactive(ws.workspaceId, false);
          logger.info(`[Vault] Resolved storage violation for workspace ${ws.workspaceId}`);
        }
      }
    }
  }
}
