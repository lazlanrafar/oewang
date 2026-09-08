import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const WORKER_KEY = "test-worker-key-1234567890";

const state = {
  processLifecycleCalls: 0,
  processStorageCalls: 0,
  hardDeleteCalls: 0,
  mayarWebhookCalls: [] as any[],
  findWorkspaceIdByIdResult: undefined as string | undefined,
  findWorkspaceOwnerResult: undefined as { id: string } | undefined,
  invoicesUpdateCalls: [] as any[],
};

mock.module("@workspace/constants", () => ({
  Env: { WORKER_API_KEY: WORKER_KEY },
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

// Not mocking "../mayar/billing-lifecycle.service" as a whole module: it's
// the same absolute path billing-lifecycle.service.test.ts requires the REAL
// implementation from, and mock.module is global for the whole bun test run
// — whichever file's mock.module call for that path runs first wins for
// every later require() of it, silently turning the other file's "real"
// import into this fake. Spy on the one static method instead (same
// technique already used below for MayarService.handleWebhook).
mock.module("../vault/vault.service", () => ({
  VaultService: {
    processStorageViolations: mock(async () => {
      state.processStorageCalls += 1;
    }),
    hardDeleteExtendedInactiveFiles: mock(async () => {
      state.hardDeleteCalls += 1;
    }),
  },
}));

// mayar.service.ts is imported for real below (not mocked as a whole module) —
// mock.module is global for the whole bun test run, and mayar.service.test.ts
// needs the REAL verifyWebhookToken; a whole-module mock here would clobber
// that regardless of file order. Instead, mock only its other transitive
// dependencies (so importing it does nothing DB-touching) and spy on the one
// static method (handleWebhook) this controller actually calls.
// NOT mocking "@workspace/email" here: mock.module is global for the whole
// bun test run, and billing-lifecycle.service.test.ts already registers its
// own (differently-shaped) mock for that same path — two conflicting mocks
// of the same module across files breaks Bun's module resolution. The real
// module is safe to import: sending only happens inside its async functions,
// which the mocked-out handleWebhook below never reaches.
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

mock.module("../mayar/billing-invoices.service", () => ({
  BillingInvoicesService: { issue: mock(async () => {}) },
}));

mock.module("../invoices/invoices.repository", () => ({
  InvoicesRepository: {
    findWorkspaceIdById: mock(async (_id: string) => {
      return state.findWorkspaceIdByIdResult;
    }),
  },
}));

mock.module("../mayar/mayar.repository", () => ({
  MayarRepository: {
    findWorkspaceOwner: mock(async (_workspaceId: string) => {
      return state.findWorkspaceOwnerResult;
    }),
    findWorkspaceByCustomerEmail: mock(async () => undefined),
    findWorkspaceById: mock(async () => undefined),
    findAllPlans: mock(async () => []),
    updateWorkspaceSubscription: mock(async () => {}),
    tryClaimEvent: mock(async () => true),
    findWorkspaceByTransactionId: mock(async () => undefined),
  },
}));

mock.module("../invoices/invoices.service", () => ({
  InvoicesService: {
    update: mock(async (id: string, workspaceId: string, userId: string, data: any) => {
      state.invoicesUpdateCalls.push({ id, workspaceId, userId, data });
      return { id };
    }),
  },
}));

const { internalController } = require("./internal.controller");
const { MayarService } = require("../mayar/mayar.service");
const {
  BillingLifecycleService,
} = require("../mayar/billing-lifecycle.service");

const ROUTES: Array<{ path: string; body: any }> = [
  { path: "/internal/billing/process-lifecycle", body: {} },
  { path: "/internal/vault/process-storage", body: {} },
  {
    path: "/internal/mayar/process-webhook",
    body: { body: { event: "payment.received" }, token: "t" },
  },
  { path: "/internal/invoices/mark-overdue", body: { invoice_id: "inv1" } },
];

function post(path: string, body: any, apiKey?: string) {
  return internalController.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey !== undefined ? { "x-api-key": apiKey } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("internal.controller — x-api-key gate", () => {
  for (const route of ROUTES) {
    it(`rejects ${route.path} with a missing x-api-key`, async () => {
      const res = await post(route.path, route.body);
      expect(res.status).toBe(401);
    });

    it(`rejects ${route.path} with a wrong x-api-key`, async () => {
      const res = await post(route.path, route.body, "wrong-key");
      expect(res.status).toBe(401);
    });
  }
});

describe("internal.controller — routes call the correct service", () => {
  let handleWebhookSpy: ReturnType<typeof spyOn>;
  let processLifecycleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    state.processLifecycleCalls = 0;
    state.processStorageCalls = 0;
    state.hardDeleteCalls = 0;
    state.mayarWebhookCalls = [];
    state.findWorkspaceIdByIdResult = undefined;
    state.findWorkspaceOwnerResult = undefined;
    state.invoicesUpdateCalls = [];
    handleWebhookSpy = spyOn(MayarService, "handleWebhook").mockImplementation(
      async (body: any, token: any) => {
        state.mayarWebhookCalls.push({ body, token });
      },
    );
    processLifecycleSpy = spyOn(
      BillingLifecycleService,
      "processLifecycle",
    ).mockImplementation(async () => {
      state.processLifecycleCalls += 1;
    });
  });

  afterEach(() => {
    handleWebhookSpy.mockRestore();
    processLifecycleSpy.mockRestore();
  });

  it("calls BillingLifecycleService.processLifecycle exactly once", async () => {
    const res = await post("/internal/billing/process-lifecycle", {}, WORKER_KEY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.processLifecycleCalls).toBe(1);
  });

  it("calls VaultService.processStorageViolations then hardDeleteExtendedInactiveFiles", async () => {
    const res = await post("/internal/vault/process-storage", {}, WORKER_KEY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.processStorageCalls).toBe(1);
    expect(state.hardDeleteCalls).toBe(1);
  });

  it("forwards {body, token} unchanged to MayarService.handleWebhook", async () => {
    const res = await post(
      "/internal/mayar/process-webhook",
      { body: { event: "payment.received" }, token: "tok-1" },
      WORKER_KEY,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.mayarWebhookCalls).toEqual([
      { body: { event: "payment.received" }, token: "tok-1" },
    ]);
  });

  it("resolves workspace_id and owner then marks the invoice overdue", async () => {
    state.findWorkspaceIdByIdResult = "ws-1";
    state.findWorkspaceOwnerResult = { id: "owner-1" };

    const res = await post(
      "/internal/invoices/mark-overdue",
      { invoice_id: "inv-1" },
      WORKER_KEY,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.invoicesUpdateCalls).toEqual([
      {
        id: "inv-1",
        workspaceId: "ws-1",
        userId: "owner-1",
        data: { status: "overdue" },
      },
    ]);
  });

  it("returns 404 when the invoice cannot be resolved to a workspace", async () => {
    state.findWorkspaceIdByIdResult = undefined;

    const res = await post(
      "/internal/invoices/mark-overdue",
      { invoice_id: "missing" },
      WORKER_KEY,
    );

    expect(res.status).toBe(404);
    expect(state.invoicesUpdateCalls).toEqual([]);
  });

  it("returns 422 when the workspace has no owner", async () => {
    state.findWorkspaceIdByIdResult = "ws-1";
    state.findWorkspaceOwnerResult = undefined;

    const res = await post(
      "/internal/invoices/mark-overdue",
      { invoice_id: "inv-1" },
      WORKER_KEY,
    );

    expect(res.status).toBe(422);
    expect(state.invoicesUpdateCalls).toEqual([]);
  });
});
