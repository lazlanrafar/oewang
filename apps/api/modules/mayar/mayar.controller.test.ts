import { describe, expect, mock, test } from "bun:test";

const mockHandleWebhook = mock(async () => {});

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

mock.module("./mayar.service", () => ({
  MayarService: {
    handleWebhook: mockHandleWebhook,
  },
}));

const { mayarController } = require("./mayar.controller");

describe("mayar.controller webhook", () => {
  test("should return 500 when webhook handler throws", async () => {
    mockHandleWebhook.mockImplementationOnce(async () => {
      throw new Error("Webhook exploded");
    });

    const response = await mayarController.handle(
      new Request("http://localhost/mayar/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "payment.created" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Webhook processing failed",
    });
  });

  test("should return success payload when webhook handler succeeds", async () => {
    mockHandleWebhook.mockImplementationOnce(async () => {});

    const response = await mayarController.handle(
      new Request("http://localhost/mayar/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "payment.created" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
