import { createLogger } from "@workspace/logger";
import type { InsertNotification } from "@workspace/types";
import {
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { NotificationSettingsRepository } from "../notification-settings/notification-settings.repository";
import { PushSubscriptionsService } from "../push-subscriptions/push-subscriptions.service";
import { RealtimeService } from "../realtime/realtime.service";
import type { NotificationListQuery } from "./notifications.dto";
import { NotificationsRepository } from "./notifications.repository";

const log = createLogger("notifications");

// Categories that always fire regardless of the user's notification settings.
// Billing, security and integration health events are too consequential to
// silence — users still need to know when a charge fails or their connected
// WhatsApp/Telegram drops.
const MANDATORY_CATEGORIES = new Set([
  "billing",
  "subscription",
  "security",
  "integration",
  "system",
]);

type CategoryToggle =
  | "transactions_enabled"
  | "budgets_enabled"
  | "debts_enabled"
  | "invoices_enabled"
  | "wallets_enabled"
  | "workspace_enabled"
  | "inbox_enabled"
  | "ai_enabled";

const CATEGORY_TOGGLES: Record<string, CategoryToggle> = {
  transaction: "transactions_enabled",
  transactions: "transactions_enabled",
  budget: "budgets_enabled",
  budgets: "budgets_enabled",
  debt: "debts_enabled",
  debts: "debts_enabled",
  invoice: "invoices_enabled",
  invoices: "invoices_enabled",
  wallet: "wallets_enabled",
  wallets: "wallets_enabled",
  workspace: "workspace_enabled",
  inbox: "inbox_enabled",
  ai: "ai_enabled",
  vault: "ai_enabled",
};

function getNotificationCategory(type: string): string {
  return type.split(".")[0] ?? type;
}

export abstract class NotificationsService {
  static async getAll(
    workspace_id: string,
    user_id: string,
    query: NotificationListQuery,
  ) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const { rows, total } = await NotificationsRepository.findAll(
      workspace_id,
      user_id,
      page,
      limit,
    );

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async markAsRead(
    workspace_id: string,
    user_id: string,
    ids: string[],
  ) {
    await NotificationsRepository.markAsRead(workspace_id, user_id, ids);
    return buildSuccess(null, "Notifications marked as read");
  }

  static async delete(workspace_id: string, user_id: string, id: string) {
    await NotificationsRepository.softDelete(workspace_id, user_id, id);
    return buildSuccess(null, "Notification deleted");
  }

  static async create(data: InsertNotification) {
    const category = getNotificationCategory(data.type);
    const isMandatory = MANDATORY_CATEGORIES.has(category);

    // Settings lookup is best-effort: if it fails (e.g. brand-new user with no
    // row yet, race during auto-create, FK error), we still want the
    // notification to fire — silently dropping mandatory billing/security
    // alerts would be the worst outcome.
    let settings: Awaited<
      ReturnType<typeof NotificationSettingsRepository.findByUserId>
    > | null = null;
    try {
      settings = await NotificationSettingsRepository.findByUserId(
        data.workspace_id,
        data.user_id,
      );
    } catch (err) {
      log.warn("Notification settings lookup failed; proceeding without gate", {
        workspace_id: data.workspace_id,
        user_id: data.user_id,
        type: data.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Optional categories respect the user's notification settings.
    // Mandatory categories (billing/security/integration) bypass the check.
    if (!isMandatory) {
      const toggle = CATEGORY_TOGGLES[category];
      if (
        toggle &&
        settings &&
        (settings as Record<string, unknown>)[toggle] === false
      ) {
        log.info("Notification suppressed by user settings", {
          workspace_id: data.workspace_id,
          user_id: data.user_id,
          type: data.type,
          toggle,
        });
        return null;
      }
    }

    const notification = await NotificationsRepository.create(data);

    log.info("Notification created", {
      workspace_id: data.workspace_id,
      user_id: data.user_id,
      type: data.type,
      mandatory: isMandatory,
    });

    // Broadcast realtime event so connected clients refresh immediately
    RealtimeService.notifyValueChange(data.workspace_id, "notifications");

    // Browser push respects push_enabled (mandatory in-app messages still show
    // in the bell, but the user can mute push without losing them).
    if (!settings || settings.push_enabled) {
      PushSubscriptionsService.sendToUser(data.user_id, {
        title: data.title,
        body: data.message,
        url: data.link ?? "/notifications",
      }).catch(() => {
        // Non-blocking: push failures should not break the main flow
      });
    }

    return notification;
  }
}
