import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { requireAdminAccess } from "../system-admins/system-admins.controller";
import { OrdersService } from "./orders.service";

export const ordersController = new Elysia({
  prefix: "/orders",
  name: "orders.controller",
})
  .use(requireAdminAccess)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      return OrdersService.getAllOrders(
        page,
        limit,
        query.search,
        query.status,
        query.start,
        query.end,
        query.attachments,
        query.manual,
      );
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        search: t.Optional(t.String()),
        status: t.Optional(t.String()),
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
        attachments: t.Optional(t.String()),
        manual: t.Optional(t.String()),
      }),
      detail: {
        summary: "List Orders",
        description:
          "Lists all payment orders (invoices/subscriptions) across the system. Restricted to system administrators.",
        tags: ["Orders"],
      },
    },
  )
  .get(
    "/stats",
    async ({ query }) => {
      return OrdersService.getStats(query.start, query.end);
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get Order Stats",
        description:
          "Returns aggregated counts (total, paid, pending, failed) for all payment orders. Restricted to system administrators.",
        tags: ["Orders"],
      },
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
      detail: {
        summary: "Get Order Details",
        description:
          "Retrieves full details of a payment order, including associated customer and transaction IDs.",
        tags: ["Orders"],
      },
    },
  );
