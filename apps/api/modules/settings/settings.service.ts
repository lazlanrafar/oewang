import { SettingsRepository } from "./settings.repository";
import type { TransactionSettingsInput } from "./settings.model";
import { encrypt } from "@workspace/encryption";
import { buildSuccess } from "@workspace/utils";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import { Env } from "@workspace/constants";

export abstract class SettingsService {
  static async getTransactionSettings(workspaceId: string) {
    let settings = await SettingsRepository.findByWorkspaceId(workspaceId);

    if (!settings) {
      settings = await SettingsRepository.create(workspaceId);
    }

    // Sanitize
    const sanitizedSettings = {
      ...settings,
      r2AccessKeyId: settings.r2AccessKeyId ? "********" : null,
      r2SecretAccessKey: settings.r2SecretAccessKey ? "********" : null,
    };

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

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "settings.updated",
      entity: "workspace_settings",
      entity_id: workspaceId,
      before: existing,
      after: updated,
    });

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
