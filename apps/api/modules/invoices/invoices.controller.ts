import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { InvoicesService } from "./invoices.service";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  InvoiceListQuery,
} from "./invoices.dto";
import { generateInvoiceToken } from "./invoices.utils";
import { buildSuccess } from "@workspace/utils";

export const invoicesController = new Elysia({ prefix: "/invoices" })
  .use(authPlugin)
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
      detail: { summary: "Get Invoices", tags: ["Invoices"] },
    },
  )
  .post(
    "/",
    async ({ workspaceId, userId, body, set }) => {
      set.status = 201;
      return InvoicesService.create(body, workspaceId!, userId!);
    },
    {
      body: CreateInvoiceDto,
      detail: { summary: "Create Invoice", tags: ["Invoices"] },
    },
  )
  .get(
    "/:id",
    async ({ workspaceId, params: { id } }) => {
      return InvoicesService.getById(id, workspaceId!);
    },
    {
      detail: { summary: "Get Invoice by ID", tags: ["Invoices"] },
    },
  )
  .get(
    "/:id/token",
    async ({ workspaceId, params: { id } }) => {
      const token = await generateInvoiceToken(id, workspaceId!);
      return buildSuccess({ token });
    },
    {
      detail: { summary: "Get Invoice Public Token", tags: ["Invoices"] },
    },
  )
  .get(
    "/:id/activity",
    async ({ workspaceId, params: { id } }) => {
      return InvoicesService.getActivity(id, workspaceId!);
    },
    {
      detail: { summary: "Get Invoice Activity", tags: ["Invoices"] },
    },
  )
  .patch(
    "/:id",
    async ({ workspaceId, userId, params: { id }, body }) => {
      return InvoicesService.update(id, workspaceId!, userId!, body);
    },
    {
      body: UpdateInvoiceDto,
      detail: { summary: "Update Invoice", tags: ["Invoices"] },
    },
  )
  .delete(
    "/:id",
    async ({ workspaceId, userId, params: { id } }) => {
      return InvoicesService.delete(id, workspaceId!, userId!);
    },
    {
      detail: { summary: "Delete Invoice", tags: ["Invoices"] },
    },
  );
