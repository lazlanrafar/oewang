import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// mayar.service.ts pulls in a wide surface (email, audit logs, notifications,
// orders, billing invoices, repository). Mock every module it imports so this
// test never touches a real DB — mirrors the mock.module() convention used in
// billing-lifecycle.service.test.ts, just wider because mayar.service.ts is.
let mockWebhookToken: string | undefined = undefined;

mock.module("@workspace/constants", () => ({
  Env: new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === "MAYAR_WEBHOOK_TOKEN") return mockWebhookToken;
        return undefined;
      },
    },
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

// mock.module() is process-global in Bun's test runner, not file-scoped — if
// another test file (e.g. internal.controller.test.ts) already required
// mayar.service.ts under a different @workspace/constants mock before this
// file's mock.module() calls above ran, the cached module keeps that other
// mock's Env binding regardless of what we register here. Evicting the cache
// entry first forces a fresh require() bound to *this* file's mock, making
// the test independent of cross-file load order.
delete require.cache[require.resolve("./mayar.service")];
const { MayarService } = require("./mayar.service");

describe("MayarService.verifyWebhookToken", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockWebhookToken = undefined;
    delete process.env.MAYAR_WEBHOOK_TOKEN;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns true when no token is configured (dev/test)", () => {
    mockWebhookToken = undefined;
    delete process.env.MAYAR_WEBHOOK_TOKEN;
    expect(MayarService.verifyWebhookToken("anything")).toBe(true);
    expect(MayarService.verifyWebhookToken(undefined)).toBe(true);
  });

  it("returns false when no token is configured in production", () => {
    process.env.NODE_ENV = "production";
    mockWebhookToken = undefined;
    delete process.env.MAYAR_WEBHOOK_TOKEN;
    // TEMP DIAGNOSTIC — remove before merge
    console.error(
      "[DIAG]",
      JSON.stringify({
        NODE_ENV: process.env.NODE_ENV,
        mockWebhookToken,
        envMayarToken: process.env.MAYAR_WEBHOOK_TOKEN,
        EnvModuleValue: require("@workspace/constants").Env.MAYAR_WEBHOOK_TOKEN,
        result: MayarService.verifyWebhookToken("anything"),
      }),
    );
    expect(MayarService.verifyWebhookToken("anything")).toBe(false);
  });

  it("returns true when the received token matches the configured token", () => {
    mockWebhookToken = "secret-token";
    process.env.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken("secret-token")).toBe(true);
  });

  it("returns false when the received token does not match the configured token", () => {
    mockWebhookToken = "secret-token";
    process.env.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken("wrong-token")).toBe(false);
  });

  it("returns false when the token is missing but a token is configured", () => {
    mockWebhookToken = "secret-token";
    process.env.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(MayarService.verifyWebhookToken(undefined)).toBe(false);
  });

  it("never throws, regardless of input", () => {
    mockWebhookToken = "secret-token";
    process.env.MAYAR_WEBHOOK_TOKEN = "secret-token";
    expect(() => MayarService.verifyWebhookToken(undefined)).not.toThrow();
    expect(() => MayarService.verifyWebhookToken("")).not.toThrow();
  });
});
