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

const { WorkerClient } = require("./worker-client");

describe("WorkerClient.enqueueTransactionsImport", () => {
  const originalFetch = global.fetch;
  let fetchCalls: { url: string; init: any }[] = [];

  beforeEach(() => {
    fetchCalls = [];
    global.fetch = mock(async (url: string, init: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ enqueued: true }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts job_id/workspace_id/user_id/data/mime_type to the worker's enqueue endpoint", async () => {
    await WorkerClient.enqueueTransactionsImport({
      jobId: "job-1",
      workspaceId: "ws-1",
      userId: "user-1",
      data: "base64data",
      mimeType: "text/csv",
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(
      `${WORKER_URL}/internal/enqueue/transactions-import`,
    );
    expect(fetchCalls[0].init.headers["x-api-key"]).toBe(WORKER_KEY);
    expect(JSON.parse(fetchCalls[0].init.body)).toEqual({
      job_id: "job-1",
      workspace_id: "ws-1",
      user_id: "user-1",
      data: "base64data",
      mime_type: "text/csv",
    });
  });

  it("throws when the enqueue call returns a non-OK status", async () => {
    global.fetch = mock(async () => {
      return new Response("boom", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      WorkerClient.enqueueTransactionsImport({
        jobId: "job-1",
        workspaceId: "ws-1",
        userId: "user-1",
        data: "base64data",
        mimeType: "text/csv",
      }),
    ).rejects.toThrow("Worker enqueue (transactions-import) failed (500)");
  });
});
