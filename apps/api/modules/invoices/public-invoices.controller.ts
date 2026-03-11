import { Elysia, t } from "elysia";
import { InvoicesService } from "./invoices.service";
import { verifyInvoiceToken } from "./invoices.utils";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const publicInvoicesController = new Elysia({ prefix: "/public/invoices" })
  .get(
    "/:token",
    async ({ params: { token }, query }) => {
      const payload = await verifyInvoiceToken(token);
      if (!payload) {
        return buildError(ErrorCode.VALIDATION_ERROR, "Invalid token");
      }

      const result = await InvoicesService.getPublicData(payload.id, payload.workspaceId);
      if (!result.success || !result.data) return result;

      const invoice = result.data.invoice;
      
      // Check if isPublic
      if (!invoice.isPublic) {
        return buildError(ErrorCode.FORBIDDEN, "This invoice is not public");
      }

      // Check if needs access code
      if (invoice.accessCode && invoice.accessCode !== query.code) {
        return buildSuccess({ needsCode: true, invoiceNumber: invoice.invoiceNumber });
      }

      return result;
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
      }),
      detail: { summary: "Get Public Invoice", tags: ["Public Invoices"] },
    },
  );
