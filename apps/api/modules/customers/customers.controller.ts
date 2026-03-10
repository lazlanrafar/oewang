import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { CustomersService } from "./customers.service";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerListQuery,
} from "./customers.dto";

export const customersController = new Elysia({ prefix: "/customers" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
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
      return CustomersService.getAll(workspaceId!, query);
    },
    {
      query: CustomerListQuery,
      detail: { summary: "Get Customers", tags: ["Customers"] },
    },
  )
  .get(
    "/:id",
    async ({ workspaceId, params: { id } }) => {
      return CustomersService.getById(id, workspaceId!);
    },
    {
      detail: { summary: "Get Customer by ID", tags: ["Customers"] },
    },
  )
  .post(
    "/",
    async ({ workspaceId, body, set }) => {
      set.status = 201;
      return CustomersService.create(body, workspaceId!);
    },
    {
      body: CreateCustomerDto,
      detail: { summary: "Create Customer", tags: ["Customers"] },
    },
  )
  .put(
    "/:id",
    async ({ workspaceId, params: { id }, body }) => {
      return CustomersService.update(id, body, workspaceId!);
    },
    {
      body: UpdateCustomerDto,
      detail: { summary: "Update Customer", tags: ["Customers"] },
    },
  )
  .delete(
    "/:id",
    async ({ workspaceId, params: { id } }) => {
      return CustomersService.remove(id, workspaceId!);
    },
    {
      detail: { summary: "Delete Customer", tags: ["Customers"] },
    },
  );
