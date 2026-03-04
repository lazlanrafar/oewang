import { Elysia, t } from "elysia";
import { OrdersService } from "./orders.service";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

import { requireAdminAccess } from "../system-admins/system-admins.controller";

export const ordersController = new Elysia({
  prefix: "/orders",
  name: "orders.controller",
})
  .use(requireAdminAccess)
  .get(
    "/",
    async ({ query }) => {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      return OrdersService.getAllOrders(page, limit, query.search);
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        search: t.Optional(t.String()),
      }),
      detail: { summary: "List Orders", tags: ["Orders"] },
    },
  )
  .get(
    "/:id",
    async ({ params }) => {
      return OrdersService.getOrderDetails(params.id);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: { summary: "Get Order Details", tags: ["Orders"] },
    },
  );
