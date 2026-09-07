import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { Elysia, t } from "elysia";
import { InvoicesRepository } from "../invoices/invoices.repository";
import { InvoicesService } from "../invoices/invoices.service";
import { BillingLifecycleService } from "../mayar/billing-lifecycle.service";
import { MayarRepository } from "../mayar/mayar.repository";
import { MayarService } from "../mayar/mayar.service";
import { VaultService } from "../vault/vault.service";

// Internal, service-to-service surface for the Go worker (apps/worker). NOT
// behind the JWT authPlugin — the worker has no user session, only a shared
// secret. Modeled on ai-internal.controller.ts's gate shape, but a distinct
// key (WORKER_API_KEY) since this is a different caller than the Python
// sidecar. Every route here just calls the existing TS service that already
// owns the business logic (billing/vault/invoice sweeps). Telegram webhook
// processing and CSV/statement transaction import are the exception: those
// are now fully owned by apps/worker itself (calling apps/ai and Postgres
// directly, see apps/worker/internal/tasks/{webhook_telegram,transactions_import}.go)
// rather than relayed through this controller.
// # ponytail: shared-secret gate; only the Go worker holds the key.
export const internalController = new Elysia({ prefix: "/internal" })
  .onBeforeHandle(({ headers, set }) => {
    const expected = Env.WORKER_API_KEY;
    // Fail closed: no key configured -> reject everything (never disable auth).
    if (!expected || headers["x-api-key"] !== expected) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .post(
    "/billing/process-lifecycle",
    async () => {
      await BillingLifecycleService.processLifecycle();
      return { ok: true };
    },
    {
      detail: {
        summary: "Run the billing lifecycle sweep (internal, Go worker)",
        tags: ["Internal"],
      },
    },
  )
  .post(
    "/vault/process-storage",
    async () => {
      await VaultService.processStorageViolations();
      await VaultService.hardDeleteExtendedInactiveFiles();
      return { ok: true };
    },
    {
      detail: {
        summary:
          "Run the vault storage-violation + hard-delete sweep (internal, Go worker)",
        tags: ["Internal"],
      },
    },
  )
  .post(
    "/mayar/process-webhook",
    async ({ body }) => {
      await MayarService.handleWebhook(body.body, body.token);
      return { ok: true };
    },
    {
      body: t.Object({
        body: t.Unknown(),
        token: t.Optional(t.String()),
      }),
      detail: {
        summary: "Process a Mayar payment webhook (internal, Go worker)",
        tags: ["Internal"],
      },
    },
  )
  .post(
    "/invoices/mark-overdue",
    async ({ body, set }) => {
      // The Go worker's own SELECT only has the invoice id — resolve
      // workspace_id here first so we can call the same workspace-scoped
      // update the manual PATCH route uses (and get its "Invoice Overdue"
      // notification for free, no duplicated notification code).
      const workspaceId = await InvoicesRepository.findWorkspaceIdById(
        body.invoice_id,
      );
      if (!workspaceId) {
        set.status = 404;
        return { ok: false, error: "Invoice not found" };
      }

      // InvoicesService.update requires an acting user_id (audit log +
      // notification recipient). There's no acting user here — this is a
      // system sweep — so the workspace owner stands in, same as the
      // billing-lifecycle sweep does for its own owner-facing notifications.
      const owner = await MayarRepository.findWorkspaceOwner(workspaceId);
      if (!owner?.id) {
        logger.error(
          "[Internal] mark-overdue: workspace has no owner, skipping",
          { workspaceId, invoiceId: body.invoice_id },
        );
        set.status = 422;
        return { ok: false, error: "Workspace has no owner" };
      }

      await InvoicesService.update(body.invoice_id, workspaceId, owner.id, {
        status: "overdue",
      });
      return { ok: true };
    },
    {
      body: t.Object({ invoice_id: t.String() }),
      detail: {
        summary: "Mark an invoice overdue (internal, Go worker)",
        tags: ["Internal"],
      },
    },
  );
