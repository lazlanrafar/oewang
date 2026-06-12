import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { assertCanManageSensitiveWorkspace } from "../workspaces/workspace-permissions";
import { BillingInvoicesService } from "./billing-invoices.service";

export const billingInvoicesController = new Elysia({
  prefix: "/billing-invoices",
  name: "billing-invoices.controller",
})
  .use(authPlugin)
  .get("/", async ({ auth, status }) => {
    if (!auth) {
      return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    assertCanManageSensitiveWorkspace(auth.workspace_role);
    const rows = await BillingInvoicesService.listForWorkspace(auth.workspaceId);
    return buildSuccess(rows, "Billing invoices retrieved");
  }, {
    detail: { summary: "List Billing Invoices", tags: ["Billing Invoices"] },
  })
  .get("/by-order/:orderId", async ({ params, auth, status }) => {
    if (!auth) {
      return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    assertCanManageSensitiveWorkspace(auth.workspace_role);
    // Lazily backfill if the row hasn't been generated yet (legacy orders or
    // a webhook that landed before billing_invoices existed).
    await BillingInvoicesService.backfillFromOrders(auth.workspaceId);
    const invoice = await BillingInvoicesService.findByOrderId(
      auth.workspaceId,
      params.orderId,
    );
    if (!invoice) {
      return status(404, buildError(ErrorCode.NOT_FOUND, "Invoice not found"));
    }
    return buildSuccess(invoice, "Billing invoice retrieved");
  }, {
    detail: {
      summary: "Get Billing Invoice by Order ID",
      tags: ["Billing Invoices"],
    },
  })
  .get("/:id", async ({ params, auth, status }) => {
    if (!auth) {
      return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    assertCanManageSensitiveWorkspace(auth.workspace_role);
    const invoice = await BillingInvoicesService.findById(
      auth.workspaceId,
      params.id,
    );
    if (!invoice) {
      return status(404, buildError(ErrorCode.NOT_FOUND, "Invoice not found"));
    }
    return buildSuccess(invoice, "Billing invoice retrieved");
  }, {
    detail: { summary: "Get Billing Invoice", tags: ["Billing Invoices"] },
  });
