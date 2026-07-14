import { beforeEach, describe, expect, it, mock } from "bun:test";

const state = {
  workspaces: [] as any[],
  updates: [] as any[],
  notifications: [] as any[],
  reminderEmails: [] as any[],
  downgradeEmails: [] as any[],
  storageEmails: [] as any[],
  plansById: {} as Record<string, any>,
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
  sendVaultStorageLimitEmail: mock(async (...args: any[]) => {
    state.storageEmails.push(args);
    return { success: true };
  }),
}));

// Bun's mock.module is global across the run, so export BOTH symbols the real
// module has — otherwise whichever logger mock runs last breaks a sibling
// test's `import { logger }`.
mock.module("@workspace/logger", () => ({
  createLogger: () => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }),
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
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
    findStarterPlan: mock(async () => ({
      id: "starter-plan",
      max_vault_size_mb: 50,
    })),
    findPlanById: mock(async (id: string) => state.plansById[id] ?? null),
    findWorkspacesForBillingLifecycle: mock(async () => state.workspaces),
    updateWorkspaceSubscription: mock(
      async (workspaceId: string, data: any) => {
        state.updates.push({ workspaceId, data });
      },
    ),
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
    state.storageEmails = [];
    state.plansById = {};
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

  it("starts the storage grace period and warns when downgrading a workspace over the Starter vault limit", async () => {
    state.workspaces = [
      {
        workspaceId: "ws_3",
        workspaceName: "Acme",
        plan_status: "past_due",
        plan_current_period_end: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        plan_overdue_started_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        vault_size_used_bytes: 200 * 1024 * 1024, // 200 MB > Starter 50 MB
        owner_id: "user_3",
        owner_name: "Owner",
        owner_email: "owner@example.com",
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates[0].data.storage_violation_at).toBeInstanceOf(Date);
    expect(
      state.notifications.some(
        (n) => n.type === "vault.storage_limit_exceeded",
      ),
    ).toBe(true);
    expect(state.storageEmails).toHaveLength(1);
  });

  it("applies a scheduled plan switch and flags storage when the new plan is smaller than current usage", async () => {
    state.plansById["small-plan"] = {
      id: "small-plan",
      max_vault_size_mb: 100,
    };
    state.workspaces = [
      {
        workspaceId: "ws_4",
        workspaceName: "Acme",
        plan_status: "active",
        pending_plan_id: "small-plan",
        pending_plan_billing_interval: "monthly",
        plan_current_period_end: new Date(Date.now() - 60_000),
        vault_size_used_bytes: 500 * 1024 * 1024, // 500 MB > new plan 100 MB
        owner_id: "user_4",
        owner_name: "Owner",
        owner_email: "owner@example.com",
      },
    ];

    await BillingLifecycleService.processLifecycle();

    expect(state.updates[0].data.plan_id).toBe("small-plan");
    expect(state.updates[0].data.plan_status).toBe("past_due");
    expect(state.updates[0].data.storage_violation_at).toBeInstanceOf(Date);
    expect(
      state.notifications.some(
        (n) => n.type === "vault.storage_limit_exceeded",
      ),
    ).toBe(true);
    expect(state.storageEmails).toHaveLength(1);
  });
});
