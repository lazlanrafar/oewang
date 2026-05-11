import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { InvoicesService } from "./invoices.service";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceListQuery,
} from "./invoices.dto";
import { generateInvoiceToken } from "./invoices.utils";
import { buildSuccess } from "@workspace/utils";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const invoicesController = new Elysia({ prefix: "/invoices" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
    userId: auth?.user_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .get(
    "/",
    async ({ workspaceId, query }) => {
      return InvoicesService.getAll(workspaceId!, query);
    },
    {
      query: InvoiceListQuery,
      detail: {
        summary: "Get Invoices",
        description: "Returns a paginated list of invoices for the active workspace.",
        tags: ["Invoices"],
      },
    },
  )
  .post(
    "/",
    async ({ auth, workspaceId, userId, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      set.status = 201;
      return InvoicesService.create(body, workspaceId!, userId!);
    },
    {
      body: CreateInvoiceDto,
      detail: {
        summary: "Create Invoice",
        description: "Creates a new invoice with line items and customer details.",
        tags: ["Invoices"],
      },
    },
  )
  .get(
    "/:id",
    async ({ workspaceId, params: { id } }) => {
      return InvoicesService.getById(id, workspaceId!);
    },
    {
      detail: {
        summary: "Get Invoice by ID",
        description: "Retrieves the full details of a specific invoice by its unique ID.",
        tags: ["Invoices"],
      },
    },
  )
  .get(
    "/:id/token",
    async ({ workspaceId, params: { id } }) => {
      const token = await generateInvoiceToken(id, workspaceId!);
      return buildSuccess({ token });
    },
    {
      detail: {
        summary: "Get Invoice Public Token",
        description: "Generates a secure, temporary token to allow public viewing of an invoice without authentication.",
        tags: ["Invoices"],
      },
    },
  )
  .get(
    "/:id/activity",
    async ({ workspaceId, params: { id } }) => {
      return InvoicesService.getActivity(id, workspaceId!);
    },
    {
      detail: {
        summary: "Get Invoice Activity",
        description: "Returns an audit trail of all changes and events related to a specific invoice.",
        tags: ["Invoices"],
      },
    },
  )
  .patch(
    "/:id",
    async ({ auth, workspaceId, userId, params: { id }, body }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      return InvoicesService.update(id, workspaceId!, userId!, body);
    },
    {
      body: UpdateInvoiceDto,
      detail: {
        summary: "Update Invoice",
        description: "Updates an existing invoice's details or metadata.",
        tags: ["Invoices"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ auth, workspaceId, userId, params: { id } }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      return InvoicesService.delete(id, workspaceId!, userId!);
    },
    {
      detail: {
        summary: "Delete Invoice",
        description: "Soft-deletes an invoice. Deleted invoices are hidden from the list but remain in the database for audit purposes.",
        tags: ["Invoices"],
      },
    },
  );
