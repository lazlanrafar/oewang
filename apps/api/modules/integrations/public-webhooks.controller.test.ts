import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const WORKER_URL = "http://worker.test";
const WORKER_KEY = "test-worker-key-1234567890";

mock.module("@workspace/constants", () => ({
  Env: {
    WORKER_URL,
    WORKER_API_KEY: WORKER_KEY,
    TELEGRAM_WEBHOOK_SECRET: "",
  },
}));

mock.module("@workspace/logger", () => ({
  logger: {
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  },
}));

const { publicWebhooksController } = require("./public-webhooks.controller");

describe("publicWebhooksController /integrations/telegram/webhook", () => {
  const originalFetch = global.fetch;
  let fetchCalls: { url: string; init: any }[] = [];

  beforeEach(() => {
    fetchCalls = [];
    global.fetch = mock(async (url: string, init: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("enqueues the parsed update to the worker and returns OK synchronously", async () => {
    const payload = { update_id: 555, message: { chat: { id: 1 }, text: "hi" } };

    const response = await publicWebhooksController.handle(
      new Request("http://localhost/integrations/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      `${WORKER_URL}/internal/enqueue/telegram-webhook`,
    );
    expect(fetchCalls[0]!.init.headers["x-api-key"]).toBe(WORKER_KEY);
    expect(JSON.parse(fetchCalls[0]!.init.body)).toEqual({
      update_id: 555,
      raw_body: payload,
    });
  });

  it("still returns OK synchronously even when the enqueue call rejects", async () => {
    global.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;

    const payload = { update_id: 556, message: { chat: { id: 2 }, text: "hi" } };

    const response = await publicWebhooksController.handle(
      new Request("http://localhost/integrations/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});
