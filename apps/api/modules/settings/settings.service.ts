import { Env } from "@workspace/constants";
import { encrypt } from "@workspace/encryption";
import { buildSuccess } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { TransactionSettingsInput } from "./settings.model";
import { SettingsRepository } from "./settings.repository";

const SETTINGS_TTL = 60 * 60 * 24; // 24h
const settingsKey = (workspaceId: string) => `oewang:settings:${workspaceId}`;

export abstract class SettingsService {
  static async getTransactionSettings(workspaceId: string) {
    const key = settingsKey(workspaceId);
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached)
      return buildSuccess(
        cached,
        "Transaction settings retrieved successfully",
      );

    let settings = await SettingsRepository.findByWorkspaceId(workspaceId);

    if (!settings) {
      settings = await SettingsRepository.create(workspaceId);
    }

    // Cache the sanitized result — never cache raw credentials
    const sanitizedSettings = {
      ...settings,
      r2AccessKeyId: settings.r2AccessKeyId ? "********" : null,
      r2SecretAccessKey: settings.r2SecretAccessKey ? "********" : null,
    };

    await cacheSet(key, sanitizedSettings, SETTINGS_TTL);

    return buildSuccess(
      sanitizedSettings,
      "Transaction settings retrieved successfully",
    );
  }

  static async updateTransactionSettings(
    workspaceId: string,
    userId: string,
    data: TransactionSettingsInput,
  ) {
    const existing = await SettingsRepository.findByWorkspaceId(workspaceId);
    if (!existing) {
      await SettingsRepository.create(workspaceId);
    }

    const encryptionSecret = Env.ENCRYPTION_KEY || "";
    const updateData = { ...data };

    if (updateData.r2AccessKeyId && updateData.r2AccessKeyId !== "********") {
      updateData.r2AccessKeyId = encrypt(
        updateData.r2AccessKeyId,
        encryptionSecret,
      );
    } else {
      delete updateData.r2AccessKeyId;
    }

    if (
      updateData.r2SecretAccessKey &&
      updateData.r2SecretAccessKey !== "********"
    ) {
      updateData.r2SecretAccessKey = encrypt(
        updateData.r2SecretAccessKey,
        encryptionSecret,
      );
    } else {
      delete updateData.r2SecretAccessKey;
    }

    const updated = await SettingsRepository.update(workspaceId, updateData);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "settings.updated",
      entity: "workspace_settings",
      entity_id: workspaceId,
      before: existing,
      after: updated,
    });

    await cacheDel(settingsKey(workspaceId));

    const sanitizedSettings = {
      ...updated,
      r2AccessKeyId: updated.r2AccessKeyId ? "********" : null,
      r2SecretAccessKey: updated.r2SecretAccessKey ? "********" : null,
    };

    return buildSuccess(
      sanitizedSettings,
      "Transaction settings updated successfully",
    );
  }
}
