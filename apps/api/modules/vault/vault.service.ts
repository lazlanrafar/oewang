import { vaultRepository } from "./vault.repository";
import { BucketClient } from "@workspace/bucket";
import { db, workspaceSettings, eq, and, isNull } from "@workspace/database";
import { decrypt } from "@workspace/encryption";
import {
  buildPagination,
  parsePaginationQuery,
  buildError,
} from "@workspace/utils";
import type { PaginationQuery } from "@workspace/types";
import { ErrorCode } from "@workspace/types";
import { status } from "elysia";
import { Env } from "@workspace/constants";

export class VaultService {
  private async getBucketClient(workspaceId: string) {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(
        and(
          eq(workspaceSettings.workspaceId, workspaceId),
          isNull(workspaceSettings.deletedAt),
        ),
      )
      .limit(1);

    const secret = Env.ENCRYPTION_KEY || "";

    // If custom R2 settings exist, use them
    if (
      settings?.r2Endpoint &&
      settings?.r2AccessKeyId &&
      settings?.r2SecretAccessKey &&
      settings?.r2BucketName
    ) {
      return new BucketClient({
        endpoint: settings.r2Endpoint,
        accessKeyId: decrypt(settings.r2AccessKeyId, secret),
        secretAccessKey: decrypt(settings.r2SecretAccessKey, secret),
        bucketName: settings.r2BucketName,
      });
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

    return new BucketClient({
      endpoint: systemEndpoint,
      accessKeyId: systemAccessKeyId,
      secretAccessKey: systemSecretAccessKey,
      bucketName: systemBucketName,
    });
  }

  async uploadFile(
    workspaceId: string,
    file: { name: string; type: string; size: number; buffer: Buffer },
  ) {
    const usageData = await vaultRepository.getUsageAndQuota(workspaceId);

    if (!usageData)
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"),
      );

    const maxVaultMb = usageData.maxMb ?? 100;
    const usedBytes = Number(usageData.used);
    const maxBytes = maxVaultMb * 1024 * 1024;

    if (usedBytes + file.size > maxBytes) {
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `Vault storage limit exceeded. Max: ${maxVaultMb}MB.`,
        ),
      );
    }

    const bucket = await this.getBucketClient(workspaceId);

    // Generate unique key
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "-");
    const key = `vault/${workspaceId}/${timestamp}-${safeName}`;

    await bucket.upload(key, file.buffer, file.type);

    const vaultEntry = await vaultRepository.create({
      workspaceId,
      name: file.name,
      key,
      size: file.size,
      type: file.type,
    });

    // Increment vault size safely in DB
    await vaultRepository.updateVaultSize(workspaceId, usedBytes + file.size);

    return vaultEntry;
  }

  async listFiles(workspaceId: string, query: PaginationQuery) {
    const { limit, offset, page } = parsePaginationQuery(query);

    const [files, total] = await Promise.all([
      vaultRepository.findMany(workspaceId, limit, offset),
      vaultRepository.count(workspaceId),
    ]);

    const bucket = await this.getBucketClient(workspaceId);

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

  async deleteFile(workspaceId: string, fileId: string) {
    const file = await vaultRepository.findById(fileId, workspaceId);
    if (!file) throw new Error("File not found");

    const bucket = await this.getBucketClient(workspaceId);
    await bucket.delete(file.key);

    const deletedFile = await vaultRepository.delete(fileId, workspaceId);

    // Decrement the vault size usage safely in DB
    const workspaceSync = await vaultRepository.getUsageAndQuota(workspaceId);

    if (workspaceSync) {
      const currentUsed = Number(workspaceSync.used);
      const newUsed = Math.max(0, currentUsed - Number(file.size));
      await vaultRepository.updateVaultSize(workspaceId, newUsed);
    }

    return deletedFile;
  }

  async getDownloadUrl(workspaceId: string, fileId: string) {
    const file = await vaultRepository.findById(fileId, workspaceId);
    if (!file) throw new Error("File not found");

    const bucket = await this.getBucketClient(workspaceId);
    return bucket.getSignedUrl(file.key);
  }

  async updateTags(workspaceId: string, fileId: string, tags: string[]) {
    return vaultRepository.updateTags(fileId, workspaceId, tags);
  }
}

export const vaultService = new VaultService();
