import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";

const log = createLogger("worker-client");

/**
 * HTTP client for the Go worker (apps/worker)'s internal enqueue endpoint.
 * Mirrors ai-sidecar-client.ts's shape: shared x-api-key secret, required
 * (no in-process fallback — job enqueueing is unavailable if WORKER_URL is
 * unset). Enqueue calls should return near-instantly (they just hand a job
 * to asynq), so this uses a much shorter timeout than the AI sidecar's
 * 120s chat/OCR budget.
 */
function workerBase(): string {
  const base = Env.WORKER_URL;
  if (!base) {
    throw new Error(
      "WORKER_URL is not set — the Go worker (apps/worker) is required to enqueue background jobs.",
    );
  }
  return base.replace(/\/$/, "");
}

async function enqueue(kind: string, body: unknown): Promise<void> {
  const res = await fetch(`${workerBase()}/internal/enqueue/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Env.WORKER_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.error("worker enqueue failed", { kind, status: res.status, text });
    throw new Error(`Worker enqueue (${kind}) failed (${res.status})`);
  }
}

export abstract class WorkerClient {
  /**
   * Enqueues a CSV/bank-statement import job. The worker calls apps/ai's
   * /import/extract directly and writes transactions/wallets/categories/
   * audit_logs itself — see apps/worker/internal/tasks/transactions_import.go.
   */
  static async enqueueTransactionsImport(params: {
    jobId: string;
    workspaceId: string;
    userId: string;
    data: string; // base64
    mimeType: string;
  }): Promise<void> {
    await enqueue("transactions-import", {
      job_id: params.jobId,
      workspace_id: params.workspaceId,
      user_id: params.userId,
      data: params.data,
      mime_type: params.mimeType,
    });
  }
}
