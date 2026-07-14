import { createHash } from "node:crypto";
import { BucketClient } from "@workspace/bucket";
import { Env } from "@workspace/constants";
import { sendVaultStorageLimitEmail } from "@workspace/email";
import { logger } from "@workspace/logger";
import type { PaginationQuery } from "@workspace/types";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPagination,
  parsePaginationQuery,
} from "@workspace/utils";
import { status } from "elysia";
import { decryptAtRest } from "../../lib/at-rest-crypto";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { VaultRepository } from "./vault.repository";

export abstract class VaultService {
  private static bucketClientCache = new Map<string, BucketClient>();

  private static buildBucketCacheKey(workspaceId: string, settings: any) {
    return JSON.stringify({
      workspaceId,
      endpoint: settings?.r2Endpoint || Env.BUCKET_ENDPOINT || "",
      accessKeyId: settings?.r2AccessKeyId || Env.BUCKET_ACCESS_KEY_ID || "",
      secretAccessKey:
        settings?.r2SecretAccessKey || Env.BUCKET_SECRET_ACCESS_KEY || "",
      bucketName: settings?.r2BucketName || Env.BUCKET_NAME || "",
    });
  }

  private static async getBucketClient(workspaceId: string) {
    const settings = await VaultRepository.getWorkspaceSettings(workspaceId);

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
        accessKeyId: decryptAtRest(settings.r2AccessKeyId),
        secretAccessKey: decryptAtRest(settings.r2SecretAccessKey),
        bucketName: settings.r2BucketName,
        region: Env.BUCKET_REGION,
      });
      VaultService.bucketClientCache.set(cacheKey, client);
      return client;
    }

    // Fallback to system bucket (from env)
    const systemEndpoint = Env.BUCKET_ENDPOINT;
    const systemAccessKeyId = Env.BUCKET_ACCESS_KEY_ID;
    const systemSecretAccessKey = Env.BUCKET_SECRET_ACCESS_KEY;
    const systemBucketName = Env.BUCKET_NAME;

    if (
      !systemEndpoint ||
      !systemAccessKeyId ||
      !systemSecretAccessKey ||
      !systemBucketName
    ) {
      throw new Error("S3 bucket storage not configured");
    }

    const client = new BucketClient({
      endpoint: systemEndpoint,
      accessKeyId: systemAccessKeyId,
      secretAccessKey: systemSecretAccessKey,
      bucketName: systemBucketName,
      region: Env.BUCKET_REGION,
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
    const key =
      existingFile?.key || `vault/${workspaceId}/${sha256}-${safeName}`;

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

    // Notify connected clients that vault storage usage has changed.
    if (additionalBytes > 0) {
      RealtimeService.notifyValueChange(workspaceId, "workspace.usage");
    }

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

    // Notify connected clients that vault storage usage has changed.
    if (activeReferences === 0) {
      RealtimeService.notifyValueChange(workspaceId, "workspace.usage");
    }

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

  /**
   * Permanently delete files that have been inactive for longer than the
   * extended retention window. Called by the same cron that runs
   * `processStorageViolations`. Two-phase cleanup:
   *   1. processStorageViolations marks files inactive 30 days after the user
   *      first goes over quota.
   *   2. hardDeleteExtendedInactiveFiles removes the R2 blobs after another
   *      60 days of inactivity (so total grace ≈ 90 days from violation).
   */
  static async hardDeleteExtendedInactiveFiles() {
    const HARD_DELETE_AFTER_DAYS = 60;
    const cutoff = new Date(
      Date.now() - HARD_DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );

    const stale = await VaultRepository.findInactiveFilesOlderThan(cutoff);
    if (stale.length === 0) return;

    logger.info(
      `[Vault] Hard-deleting ${stale.length} files inactive for >${HARD_DELETE_AFTER_DAYS}d`,
    );

    // Group keys by workspace so we minimise duplicate bucket lookups.
    const byWorkspace = new Map<string, typeof stale>();
    for (const file of stale) {
      const list = byWorkspace.get(file.workspaceId) ?? [];
      list.push(file);
      byWorkspace.set(file.workspaceId, list);
    }

    for (const [workspaceId, files] of byWorkspace) {
      let bucket: Awaited<ReturnType<typeof VaultService.getBucketClient>>;
      try {
        bucket = await VaultService.getBucketClient(workspaceId);
      } catch (err) {
        logger.error("[Vault] Could not load bucket client for hard delete", {
          workspaceId,
          err,
        });
        continue;
      }

      for (const file of files) {
        try {
          // Soft-delete the row first (others can no longer reference this key
          // via this row), then count remaining live rows pointing at the same
          // blob. Only delete from R2 when this was the last reference.
          await VaultRepository.markDeleted(file.id, workspaceId);

          const remaining = await VaultRepository.countActiveByKey(
            workspaceId,
            file.key,
          );

          if (remaining === 0) {
            try {
              await bucket.delete(file.key);
            } catch (err) {
              logger.warn(
                "[Vault] R2 delete failed during hard delete (continuing)",
                { workspaceId, key: file.key, err },
              );
            }
            await VaultRepository.incrementVaultSize(
              workspaceId,
              -Number(file.size),
            );
          }
        } catch (err) {
          logger.error("[Vault] Hard delete error for file", {
            workspaceId,
            fileId: file.id,
            err,
          });
        }
      }

      RealtimeService.notifyValueChange(workspaceId, "workspace.usage");
    }
  }

  private static async notifyStorageViolationStarted(
    ws: {
      workspaceId: string;
      workspaceName?: string | null;
      maxMb: number;
      owner_id?: string | null;
      owner_name?: string | null;
      owner_email?: string | null;
    },
    info: { usedMb: number; gracePeriodDays: number; deadline: Date },
  ) {
    if (ws.owner_id) {
      await NotificationsService.create({
        workspace_id: ws.workspaceId,
        user_id: ws.owner_id,
        type: "vault.storage_limit_exceeded",
        title: "Vault is over the storage limit",
        message: `Your vault uses ${info.usedMb.toFixed(0)} MB but your plan allows ${ws.maxMb} MB. You have ${info.gracePeriodDays} days to remove files or upgrade — after that, files will be hidden and eventually deleted.`,
        link: "/vault",
      }).catch(() => {});
    }
    if (ws.owner_email) {
      await sendVaultStorageLimitEmail(
        ws.owner_email,
        ws.owner_name || "there",
        ws.workspaceName || "Workspace",
        info.usedMb,
        ws.maxMb,
        info.gracePeriodDays,
        info.deadline,
      ).catch((err) =>
        logger.warn("[Vault] Storage limit email failed (non-fatal)", { err }),
      );
    }
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
          logger.info(
            `[Vault] Started storage violation grace period for workspace ${ws.workspaceId}`,
          );
          // Warn the owner NOW — this is the only signal before files are hidden
          // (after 30 days) and eventually deleted. Silent otherwise.
          await VaultService.notifyStorageViolationStarted(ws, {
            usedMb,
            gracePeriodDays,
            deadline: new Date(
              now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000,
            ),
          });
        } else {
          // Check if grace period has expired
          const violationDate = new Date(ws.storage_violation_at);
          const diffDays =
            (now.getTime() - violationDate.getTime()) / (1000 * 60 * 60 * 24);

          if (diffDays > gracePeriodDays) {
            // Mark all files as inactive
            await VaultRepository.bulkSetFilesInactive(ws.workspaceId, true);
            logger.warn(
              `[Vault] Grace period expired. Marked files as inactive for workspace ${ws.workspaceId}`,
            );
          }
        }
      } else {
        // Not over quota - resolve the violation if it exists
        if (ws.storage_violation_at) {
          await VaultRepository.updateWorkspaceSubscription(ws.workspaceId, {
            storage_violation_at: null,
          });
          await VaultRepository.bulkSetFilesInactive(ws.workspaceId, false);
          logger.info(
            `[Vault] Resolved storage violation for workspace ${ws.workspaceId}`,
          );
        }
      }
    }
  }
}
