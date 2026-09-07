import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// mayar.service.ts pulls in a wide surface (email, audit logs, notifications,
// orders, billing invoices, repository). Mock every module it imports so this
// test never touches a real DB — mirrors the mock.module() convention used in
// billing-lifecycle.service.test.ts, just wider because mayar.service.ts is.
const envState: Record<string, string | undefined> = {
  MAYAR_WEBHOOK_TOKEN: undefined,
};

mock.module("@workspace/constants", () => ({
  Env: new Proxy(
    {},
    { get: (_target, prop: string) => envState[prop] },
  ),
}));

mock.module("@workspace/logger", () => ({
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
  createLogger: () => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }),
}));

// NOT mocking "@workspace/email" here: mock.module is global for the whole
// bun test run, and billing-lifecycle.service.test.ts already registers its
// own (differently-shaped) mock for that same path — two conflicting mocks
// of the same module across files breaks Bun's module resolution. The real
// module is safe to import: sending only happens inside its async functions,
// which this file's tests (verifyWebhookToken only) never call.
mock.module("../audit-logs/audit-logs.service", () => ({
  AuditLogsService: { log: mock(async () => {}) },
}));

mock.module("../notifications/notifications.service", () => ({
  NotificationsService: { create: mock(async () => {}) },
}));

mock.module("../orders/orders.service", () => ({
  OrdersService: {
    orderExistsForInvoice: mock(async () => false),
    createOrder: mock(async () => {}),
    updateOrderFromInvoiceId: mock(async () => {}),
  },
}));

mock.module("./billing-invoices.service", () => ({
  BillingInvoicesService: { issue: mock(async () => {}) },
}));

mock.module("./mayar.repository", () => ({
  MayarRepository: {
    findWorkspaceByCustomerEmail: mock(async () => undefined),
    findWorkspaceOwner: mock(async () => undefined),
    findWorkspaceById: mock(async () => undefined),
    findAllPlans: mock(async () => []),
    updateWorkspaceSubscription: mock(async () => {}),
    tryClaimEvent: mock(async () => true),
    findWorkspaceByTransactionId: mock(async () => undefined),
  },
}));

const { MayarService } = require("./mayar.service");

describe("MayarService.verifyWebhookToken", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    envState.MAYAR_WEBHOOK_TOKEN = undefined;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns true when no token is configured (dev/test)", () => {
    envState.MAYAR_WEBHOOK_TOKEN = undefined;
    expect(MayarService.verifyWebhookToken("anything")).toBe(true);
    expect(MayarService.verifyWebhookToken(undefined)).toBe(true);
  });

  it("returns false when no token is configured in production", () => {
    process.env.NODE_ENV = "production";
    envState.MAYAR_WEBHOOK_TOKEN = undefined;
    expect(MayarService.verifyWebhookToken("anything")).toBe(false);
  });

  it("returns true when the received token matches the configured token", () => {
    envState.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken("secret-token")).toBe(true);
  });

  it("returns false when the received token does not match the configured token", () => {
    envState.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken("wrong-token")).toBe(false);
  });

  it("returns false when the token is missing but a token is configured", () => {
    envState.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken(undefined)).toBe(false);
  });

  it("never throws, regardless of input", () => {
    envState.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(() => MayarService.verifyWebhookToken(undefined)).not.toThrow();
    expect(() => MayarService.verifyWebhookToken("")).not.toThrow();
  });
});
