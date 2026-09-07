import { redis } from "@workspace/redis";
import { getOrSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CategoriesRepository } from "../categories/categories.repository";
import type { ChatMessage } from "./ai.dto";
import { AiRepository } from "./ai.repository";
import { AiSidecarClient } from "./ai-sidecar-client";

const QUOTA_TTL = 60;
const quotaKey = (workspaceId: string) => `oewang:ai:quota:${workspaceId}`;

// Still referenced by Telegram's receipt-photo upload path
// (integrations.service.ts) when building the attachment array it hands to
// AiSidecarClient.buildInvoiceDraftFromAttachments.
export type ChatAttachment = NonNullable<ChatMessage["attachments"]>[number];

/**
 * What remains here after the chat money path (chatBegin/chatEnd, the
 * receipt-draft short-circuit, and the in-process chat() fallback) moved to
 * apps/ai (see apps/ai/app/modules/chatbot/{chat_money_path,draft}.py): the
 * standalone receipt-parse endpoint (Gmail/Outlook integrations) and
 * session/quota reads for the dashboard's AI sidebar.
 */
export abstract class AiService {
  static async parseReceipt(
    workspaceId: string,
    userId: string,
    base64Image: string,
    mediaType: string,
  ) {
    const categories = await CategoriesRepository.findMany(
      workspaceId,
      "expense",
    );
    const categoryContext = categories
      .map((c: any) => `- ${c.name} (ID: ${c.id})`)
      .join("\n");

    const parsed = await AiSidecarClient.parseReceipt(
      base64Image,
      mediaType,
      categoryContext,
      workspaceId,
    );

    if (parsed) {
      if (parsed.name && parsed.categoryId) {
        const cacheKey = `oewang:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
        await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 });
      }

      await AuditLogsService.log({
        workspace_id: workspaceId,
        user_id: userId,
        action: "ai.receipt_parsed",
        entity: "vault_file",
        entity_id: "00000000-0000-0000-0000-000000000000",
        before: null,
        after: parsed,
      });
    }

    return parsed;
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    return AiRepository.getSessionMessages(sessionId, workspaceId);
  }

  static async getSession(sessionId: string, workspaceId: string) {
    return AiRepository.getSession(sessionId, workspaceId);
  }

  // Display-only cache for GET /ai/quota (fetched on every page load). Quota
  // ENFORCEMENT (apps/ai's chat_money_path.chat_begin_core / core/quota.py)
  // reads the DB directly and is never cached, so the displayed number here
  // can lag up to QUOTA_TTL.
  static async getUsageAndQuota(workspaceId: string) {
    // Workspace-less sessions would all share one empty-suffix key.
    if (!workspaceId) return AiRepository.getUsageAndQuota(workspaceId);
    return getOrSet(quotaKey(workspaceId), QUOTA_TTL, () =>
      AiRepository.getUsageAndQuota(workspaceId),
    );
  }
}
