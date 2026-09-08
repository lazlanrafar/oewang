import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const WORKER_URL = "http://worker.test";
const WORKER_KEY = "test-worker-key-1234567890";

mock.module("@workspace/constants", () => ({
  Env: { WORKER_URL, WORKER_API_KEY: WORKER_KEY },
}));

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
