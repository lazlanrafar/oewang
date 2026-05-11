import { sendSubscriptionDowngradedEmail, sendSubscriptionPaymentReminderEmail } from "@workspace/email";
import { createLogger } from "@workspace/logger";
import { NotificationsService } from "../notifications/notifications.service";
import { MayarRepository } from "./mayar.repository";

const log = createLogger("billing-lifecycle");
const GRACE_PERIOD_DAYS = 7;

function daysBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export abstract class BillingLifecycleService {
  private static async sendPastDueReminder(workspace: any, overdueStartedAt: Date) {
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

  private static async downgradeWorkspace(workspace: any, reason: "past_due" | "cancelled") {
    const starterPlan = await MayarRepository.findStarterPlan();

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
      ai_tokens_reset_at: new Date(),
      updated_at: new Date(),
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
    const workspaces = await MayarRepository.findWorkspacesForBillingLifecycle();
    const now = new Date();

    for (const workspace of workspaces) {
      if (!workspace.plan_current_period_end) continue;

      const currentPeriodEnd = new Date(workspace.plan_current_period_end);
      if (currentPeriodEnd > now) continue;

      if (workspace.plan_status === "cancelled") {
        await this.downgradeWorkspace(workspace, "cancelled");
        log.info("Downgraded cancelled workspace at period end", {
          workspaceId: workspace.workspaceId,
        });
        continue;
      }

      if (workspace.plan_status === "active") {
        const overdueStartedAt = workspace.plan_overdue_started_at
          ? new Date(workspace.plan_overdue_started_at)
          : now;

        await MayarRepository.updateWorkspaceSubscription(workspace.workspaceId, {
          plan_status: "past_due",
          plan_overdue_started_at: overdueStartedAt,
          plan_last_reminder_at: now,
          updated_at: now,
        });

        await this.sendPastDueReminder(workspace, overdueStartedAt);
        log.warn("Marked workspace as past due", {
          workspaceId: workspace.workspaceId,
        });
        continue;
      }

      if (workspace.plan_status === "past_due") {
        const overdueStartedAt = workspace.plan_overdue_started_at
          ? new Date(workspace.plan_overdue_started_at)
          : currentPeriodEnd;

        if (
          !workspace.plan_last_reminder_at &&
          daysBetween(overdueStartedAt, now) < GRACE_PERIOD_DAYS
        ) {
          await MayarRepository.updateWorkspaceSubscription(workspace.workspaceId, {
            plan_last_reminder_at: now,
            updated_at: now,
          });
          await this.sendPastDueReminder(workspace, overdueStartedAt);
        }

        if (daysBetween(overdueStartedAt, now) >= GRACE_PERIOD_DAYS) {
          await this.downgradeWorkspace(workspace, "past_due");
          log.warn("Downgraded past due workspace after grace period", {
            workspaceId: workspace.workspaceId,
          });
        }
      }
    }
  }
}
