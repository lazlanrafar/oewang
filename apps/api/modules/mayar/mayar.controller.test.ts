import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const WORKER_URL = "http://worker.test";
const WORKER_KEY = "test-worker-key-1234567890";

mock.module("@workspace/constants", () => ({
  Env: { WORKER_URL, WORKER_API_KEY: WORKER_KEY },
}));

// Captured before mocking "./mayar.service" below so afterAll can restore
// the real module for any test file that runs after this one in the same
// bun test process (mock.module() is process-global, not file-scoped, and
// mock.restore() does not undo it in Bun 1.3.3).
const realMayarServiceModule = require("./mayar.service");

mock.module("@workspace/logger", () => ({
  logger: {
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  },
  createLogger: () => ({
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  }),
}));

const mockVerifyWebhookToken = mock((_token?: string) => true);
const mockHandleWebhook = mock(async () => {});

mock.module("./mayar.service", () => ({
  MayarService: {
    verifyWebhookToken: mockVerifyWebhookToken,
    handleWebhook: mockHandleWebhook,
  },
}));

const { mayarController } = require("./mayar.controller");

// mock.module() replaces "./mayar.service" process-wide for the rest of the
// bun test run, not just this file — every OTHER test file's top-level
// require("./mayar.service") (e.g. mayar.service.test.ts, which tests the
// real module) runs during the same load phase, before any test or afterAll
// fires, and would silently get this stub instead. mock.restore() does NOT
// undo mock.module() registrations in Bun 1.3.3, so restore the real module
// synchronously right here — mayar.controller has already captured the stub
// it needs via the `require("./mayar.controller")` above, so re-pointing the
// mock factory back to the real module now is safe and takes effect before
// any later file's top-level code runs.
mock.module("./mayar.service", () => realMayarServiceModule);

describe("mayar.controller webhook", () => {
  const originalFetch = global.fetch;
  let fetchCalls: { url: string; init: any }[] = [];

  beforeEach(() => {
    fetchCalls = [];
    mockVerifyWebhookToken.mockReset();
    mockVerifyWebhookToken.mockImplementation(() => true);
    mockHandleWebhook.mockClear();
    global.fetch = mock(async (url: string, init: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("enqueues the webhook to the worker and returns success on a valid token", async () => {
    mockVerifyWebhookToken.mockImplementation(() => true);

    const response = await mayarController.handle(
      new Request("http://localhost/mayar/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mayar-token": "good-token",
        },
        body: JSON.stringify({ event: "payment.created" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      `${WORKER_URL}/internal/enqueue/mayar-webhook`,
    );
    expect(fetchCalls[0]!.init.headers["x-api-key"]).toBe(WORKER_KEY);
    expect(JSON.parse(fetchCalls[0]!.init.body)).toEqual({
      body: { event: "payment.created" },
      token: "good-token",
    });

    // Processing moved to the internal endpoint the Go worker calls — the
    // webhook route itself must never call handleWebhook directly anymore.
    expect(mockHandleWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 synchronously on a bad token, without enqueueing", async () => {
    mockVerifyWebhookToken.mockImplementation(() => false);

    const response = await mayarController.handle(
      new Request("http://localhost/mayar/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "payment.created" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns 500 when the enqueue call itself fails", async () => {
    mockVerifyWebhookToken.mockImplementation(() => true);
    global.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;

    const response = await mayarController.handle(
      new Request("http://localhost/mayar/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "payment.created" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Webhook enqueue failed",
    });
  });
});
