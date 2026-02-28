import { Elysia, t } from "elysia";
import { OrdersService } from "./orders.service";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const ordersController = new Elysia({
  prefix: "/orders",
  name: "orders.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
    if (auth.system_role !== "admin") {
      set.status = 403;
      return buildError(ErrorCode.FORBIDDEN, "Admin access required");
    }
  })
  .get(
    "/",
    async ({ query }) => {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      return OrdersService.getAllOrders(page, limit);
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
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
    },
  );
