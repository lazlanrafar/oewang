import { logger } from "@workspace/logger";
import { buildSuccess } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { NotificationsService } from "../notifications/notifications.service";
import { IntegrationsRepository } from "./integrations.repository";

const INTEGRATIONS_TTL = 60 * 60 * 24; // 24h — integration configs rarely change
const integrationsKey = (workspaceId: string) =>
  `oewang:integrations:${workspaceId}`;

export abstract class IntegrationsService {
  static async connectTelegram(
    workspaceId: string,
    userId: string,
    telegramChatId: string,
  ) {
    const integration = await IntegrationsRepository.upsert({
      workspaceId,
      provider: "telegram",
      settings: { telegramChatId },
      isActive: true,
      connectedBy: userId,
    });

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "integration.connected",
      title: "Telegram Connected",
      message:
        "Telegram has been connected to your workspace. You can now chat with your AI assistant via Telegram.",
      link: "/apps",
    }).catch((err) =>
      logger.error("Failed to create Telegram connected notification", {
        err,
        workspaceId,
        userId,
      }),
    );

    await cacheDel(integrationsKey(workspaceId));

    return buildSuccess(integration, "Telegram connected successfully");
  }

  static async getAll(workspace_id: string) {
    const key = integrationsKey(workspace_id);
    const cached = await cacheGet<object[]>(key);
    if (cached)
      return buildSuccess(cached, "Integrations retrieved successfully");

    const integrations = await IntegrationsRepository.findAll(workspace_id);
    await cacheSet(key, integrations, INTEGRATIONS_TTL);
    return buildSuccess(integrations, "Integrations retrieved successfully");
  }

  static async disconnectIntegration(
    workspaceId: string,
    provider: string,
    userId?: string,
  ) {
    const disconnected = await IntegrationsRepository.disconnectByProvider(
      workspaceId,
      provider,
    );

    if (!disconnected) {
      return buildSuccess(null, `${provider} is already disconnected`);
    }

    if (userId) {
      const providerLabel =
        provider.charAt(0).toUpperCase() + provider.slice(1);
      NotificationsService.create({
        workspace_id: workspaceId,
        user_id: userId,
        type: "integration.disconnected",
        title: `${providerLabel} Disconnected`,
        message: `${providerLabel} has been disconnected from your workspace.`,
        link: "/apps",
      }).catch(() => {});
    }

    await cacheDel(integrationsKey(workspaceId));

    return buildSuccess(disconnected, `${provider} disconnected successfully`);
  }
}
