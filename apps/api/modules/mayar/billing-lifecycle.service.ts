import {
  sendSubscriptionDowngradedEmail,
  sendSubscriptionPaymentReminderEmail,
} from "@workspace/email";
import { createLogger } from "@workspace/logger";
import { NotificationsService } from "../notifications/notifications.service";
import { MayarRepository } from "./mayar.repository";

const log = createLogger("billing-lifecycle");
const GRACE_PERIOD_DAYS = 7;
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

    const dueDate = workspace.plan_current_period_end
      ? new Date(workspace.plan_current_period_end)
      : overdueStartedAt;

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

  private static async downgradeWorkspace(
    workspace: any,
    reason: "past_due" | "cancelled",
  ) {
    const starterPlan = await MayarRepository.findStarterPlan();
    const now = new Date();

    // Check if the workspace's current vault usage exceeds the Starter limit.
    // If so, start the storage-violation grace period RIGHT NOW so the user has
    // immediate clarity instead of waiting for the next vault cron to detect it.
    const starterVaultMb = starterPlan?.max_vault_size_mb ?? 50;
    const usedMb = (workspace.vault_size_used_bytes ?? 0) / (1024 * 1024);
    const willExceedVault = usedMb > starterVaultMb;

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
      // Start the 30-day storage grace period at the moment of downgrade so
      // the countdown is predictable. If the workspace is already below limit
      // (e.g. they deleted files just before), leave it null.
      storage_violation_at: willExceedVault ? now : null,
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

      // If they're over the Starter vault limit, send a separate explicit warning
      // so they can act before the 30-day grace period expires.
      if (willExceedVault) {
        await NotificationsService.create({
          workspace_id: workspace.workspaceId,
          user_id: workspace.owner_id,
          type: "vault.storage_limit_exceeded",
          title: "Vault is over the Starter limit",
          message: `Your vault contains ${usedMb.toFixed(0)} MB but Starter allows ${starterVaultMb} MB. You have 30 days to remove files or upgrade — after that, files will be hidden and eventually deleted.`,
          link: "/vault",
        });
      }
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
