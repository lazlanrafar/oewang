import {
  sendSubscriptionDowngradedEmail,
  sendSubscriptionPaymentReminderEmail,
  sendVaultStorageLimitEmail,
} from "@workspace/email";
import { createLogger } from "@workspace/logger";
import { NotificationsService } from "../notifications/notifications.service";
import { MayarRepository } from "./mayar.repository";

const log = createLogger("billing-lifecycle");
const GRACE_PERIOD_DAYS = 7;
// Days a workspace has to clear a storage overage before files are hidden.
// Mirrors VaultService.processStorageViolations so the warning we send matches.
const STORAGE_GRACE_DAYS = 30;
// How often (in days) to re-send payment reminders during the grace period.
// e.g. remind at day 0, day 3, day 6 → downgrade at day 7.
const REMINDER_INTERVAL_DAYS = 3;

function daysBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export abstract class BillingLifecycleService {
  private static async sendPastDueReminder(
    workspace: any,
    overdueStartedAt: Date,
  ) {
    if (!workspace.owner_id) return;

    // The deadline the user must act by is when the grace period ends, not the
    // already-passed period end. Show that so the email reads a future date.
    const dueDate = new Date(
      overdueStartedAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    await NotificationsService.create({
      workspace_id: workspace.workspaceId,
      user_id: workspace.owner_id,
      type: "subscription.payment_due",
      title: "Payment overdue",
      message:
        "Your subscription payment is overdue. Please renew within 7 days to avoid a downgrade to Starter.",
      link: "/settings/billing",
    });

    if (workspace.owner_email) {
      await sendSubscriptionPaymentReminderEmail(
        workspace.owner_email,
        workspace.owner_name || "there",
        workspace.workspaceName,
        dueDate,
      );
    }
  }

  /**
   * If the workspace's vault usage exceeds `planVaultMb`, start the storage
   * grace period now and warn the owner (in-app + email). Returns the value to
   * write into `storage_violation_at` (a Date if over, else null) so callers can
   * fold it into their own subscription update.
   *
   * Starting the countdown here — instead of waiting for the vault cron — gives
   * the user a predictable deadline the moment their plan changes.
   */
  private static async flagStorageIfOverPlan(
    workspace: any,
    planVaultMb: number,
    now: Date,
  ): Promise<Date | null> {
    const usedMb = (workspace.vault_size_used_bytes ?? 0) / (1024 * 1024);
    if (usedMb <= planVaultMb) return null;

    const deadline = new Date(
      now.getTime() + STORAGE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    );

    if (workspace.owner_id) {
      await NotificationsService.create({
        workspace_id: workspace.workspaceId,
        user_id: workspace.owner_id,
        type: "vault.storage_limit_exceeded",
        title: "Vault is over the storage limit",
        message: `Your vault contains ${usedMb.toFixed(0)} MB but your new plan allows ${planVaultMb} MB. You have ${STORAGE_GRACE_DAYS} days to remove files or upgrade — after that, files will be hidden and eventually deleted.`,
        link: "/vault",
      }).catch(() => {});
    }

    if (workspace.owner_email) {
      await sendVaultStorageLimitEmail(
        workspace.owner_email,
        workspace.owner_name || "there",
        workspace.workspaceName || "Workspace",
        usedMb,
        planVaultMb,
        STORAGE_GRACE_DAYS,
        deadline,
      ).catch((err) =>
        log.warn("Storage limit email failed (non-fatal)", { err }),
      );
    }

    return now;
  }

  private static async downgradeWorkspace(
    workspace: any,
    reason: "past_due" | "cancelled",
  ) {
    const starterPlan = await MayarRepository.findStarterPlan();
    const now = new Date();

    const starterVaultMb = starterPlan?.max_vault_size_mb ?? 50;
    const storageViolationAt =
      await BillingLifecycleService.flagStorageIfOverPlan(
        workspace,
        starterVaultMb,
        now,
      );

    await MayarRepository.updateWorkspaceSubscription(workspace.workspaceId, {
      plan_id: starterPlan?.id || null,
      plan_status: "free",
      plan_billing_interval: null,
      plan_started_at: null,
      plan_current_period_end: null,
      plan_overdue_started_at: null,
      plan_last_reminder_at: null,
      mayar_transaction_id: null,
      ai_tokens_used: 0,
      ai_tokens_reset_at: now,
      storage_violation_at: storageViolationAt,
      updated_at: now,
    });

    if (workspace.owner_id) {
      await NotificationsService.create({
        workspace_id: workspace.workspaceId,
        user_id: workspace.owner_id,
        type: "subscription.downgraded",
        title: "Workspace downgraded",
        message:
          reason === "cancelled"
            ? "Your paid subscription ended and the workspace has been moved to Starter."
            : "Your workspace has been downgraded to Starter after 7 days without payment.",
        link: "/settings/billing",
      });
    }

    if (workspace.owner_email) {
      await sendSubscriptionDowngradedEmail(
        workspace.owner_email,
        workspace.owner_name || "there",
        workspace.workspaceName,
      );
    }
  }

  static async processLifecycle() {
    const workspaces =
      await MayarRepository.findWorkspacesForBillingLifecycle();
    const now = new Date();

    for (const workspace of workspaces) {
      if (!workspace.plan_current_period_end) continue;

      const currentPeriodEnd = new Date(workspace.plan_current_period_end);
      if (currentPeriodEnd > now) continue;

      if (workspace.plan_status === "cancelled") {
        await BillingLifecycleService.downgradeWorkspace(
          workspace,
          "cancelled",
        );
        log.info("Downgraded cancelled workspace at period end", {
          workspaceId: workspace.workspaceId,
        });
        continue;
      }

      // Apply a scheduled plan switch at period end. We swap plan_id + billing
      // interval, clear the pending fields, and mark past_due so the next
      // payment.received webhook reactivates the subscription. The user gets a
      // payment reminder pointing at the new plan's checkout.
      if (workspace.plan_status === "active" && workspace.pending_plan_id) {
        // If switching to a smaller plan whose vault limit the workspace already
        // exceeds, start the storage grace period now (same as a downgrade) so
        // the user isn't silently walked toward file deletion by the vault cron.
        const targetPlan = await MayarRepository.findPlanById(
          workspace.pending_plan_id,
        );
        const storageViolationAt =
          await BillingLifecycleService.flagStorageIfOverPlan(
            workspace,
            targetPlan?.max_vault_size_mb ?? 0,
            now,
          );

        await MayarRepository.updateWorkspaceSubscription(
          workspace.workspaceId,
          {
            plan_id: workspace.pending_plan_id,
            plan_billing_interval: workspace.pending_plan_billing_interval,
            pending_plan_id: null,
            pending_plan_billing_interval: null,
            plan_status: "past_due",
            plan_overdue_started_at: now,
            plan_last_reminder_at: now,
            ...(storageViolationAt
              ? { storage_violation_at: storageViolationAt }
              : {}),
            updated_at: now,
          },
        );
        await BillingLifecycleService.sendPastDueReminder(workspace, now);
        log.info("Applied scheduled plan switch at period end", {
          workspaceId: workspace.workspaceId,
          newPlanId: workspace.pending_plan_id,
        });
        continue;
      }

      if (workspace.plan_status === "active") {
        const overdueStartedAt = workspace.plan_overdue_started_at
          ? new Date(workspace.plan_overdue_started_at)
          : now;

        await MayarRepository.updateWorkspaceSubscription(
          workspace.workspaceId,
          {
            plan_status: "past_due",
            plan_overdue_started_at: overdueStartedAt,
            plan_last_reminder_at: now,
            updated_at: now,
          },
        );

        await BillingLifecycleService.sendPastDueReminder(
          workspace,
          overdueStartedAt,
        );
        log.warn("Marked workspace as past due", {
          workspaceId: workspace.workspaceId,
        });
        continue;
      }

      if (workspace.plan_status === "past_due") {
        const overdueStartedAt = workspace.plan_overdue_started_at
          ? new Date(workspace.plan_overdue_started_at)
          : currentPeriodEnd;

        const daysOverdue = daysBetween(overdueStartedAt, now);

        if (daysOverdue >= GRACE_PERIOD_DAYS) {
          // Grace period expired — downgrade immediately.
          await BillingLifecycleService.downgradeWorkspace(
            workspace,
            "past_due",
          );
          log.warn("Downgraded past due workspace after grace period", {
            workspaceId: workspace.workspaceId,
          });
          continue;
        }

        // Send escalating reminders every REMINDER_INTERVAL_DAYS within the grace period.
        // The first reminder was sent when transitioning active → past_due, so
        // plan_last_reminder_at is always set. We re-send when enough time has passed.
        const daysSinceLastReminder = workspace.plan_last_reminder_at
          ? daysBetween(new Date(workspace.plan_last_reminder_at), now)
          : REMINDER_INTERVAL_DAYS; // treat as overdue so we send immediately if never reminded

        if (daysSinceLastReminder >= REMINDER_INTERVAL_DAYS) {
          await MayarRepository.updateWorkspaceSubscription(
            workspace.workspaceId,
            {
              plan_last_reminder_at: now,
              updated_at: now,
            },
          );
          await BillingLifecycleService.sendPastDueReminder(
            workspace,
            overdueStartedAt,
          );
          log.info("Sent escalating payment reminder", {
            workspaceId: workspace.workspaceId,
            daysOverdue,
          });
        }
      }
    }
  }
}
