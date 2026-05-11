import { beforeEach, describe, expect, it, mock } from "bun:test";

const state = {
  workspaces: [] as any[],
  updates: [] as any[],
  notifications: [] as any[],
  reminderEmails: [] as any[],
  downgradeEmails: [] as any[],
};

mock.module("@workspace/email", () => ({
  sendSubscriptionPaymentReminderEmail: mock(async (...args: any[]) => {
    state.reminderEmails.push(args);
    return { success: true };
  }),
  sendSubscriptionDowngradedEmail: mock(async (...args: any[]) => {
    state.downgradeEmails.push(args);
    return { success: true };
  }),
}));

mock.module("@workspace/logger", () => ({
  createLogger: () => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

mock.module("../notifications/notifications.service", () => ({
  NotificationsService: {
    create: mock(async (data: any) => {
      state.notifications.push(data);
      return data;
    }),
  },
}));

mock.module("./mayar.repository", () => ({
  MayarRepository: {
    findStarterPlan: mock(async () => ({ id: "starter-plan" })),
    findWorkspacesForBillingLifecycle: mock(async () => state.workspaces),
    updateWorkspaceSubscription: mock(async (workspaceId: string, data: any) => {
      state.updates.push({ workspaceId, data });
    }),
  },
}));

const { BillingLifecycleService } = require("./billing-lifecycle.service");

describe("BillingLifecycleService", () => {
  beforeEach(() => {
    state.workspaces = [];
    state.updates = [];
    state.notifications = [];
    state.reminderEmails = [];
    state.downgradeEmails = [];
  });

  it("marks expired active subscriptions as past due and sends a reminder", async () => {
    state.workspaces = [
      {
        workspaceId: "ws_1",
        workspaceName: "Acme",
        plan_status: "active",
        plan_current_period_end: new Date(Date.now() - 60_000),
        owner_id: "user_1",
        owner_name: "Owner",
        owner_email: "owner@example.com",
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.plan_status).toBe("past_due");
    expect(state.notifications[0].type).toBe("subscription.payment_due");
    expect(state.reminderEmails).toHaveLength(1);
  });

  it("downgrades past due subscriptions after the 7 day grace period", async () => {
    state.workspaces = [
      {
        workspaceId: "ws_2",
        workspaceName: "Acme",
        plan_status: "past_due",
        plan_current_period_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        plan_overdue_started_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        owner_id: "user_2",
        owner_name: "Owner",
        owner_email: "owner@example.com",
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].data.plan_status).toBe("free");
    expect(state.updates[0].data.plan_id).toBe("starter-plan");
    expect(state.notifications[0].type).toBe("subscription.downgraded");
    expect(state.downgradeEmails).toHaveLength(1);
  });
});
