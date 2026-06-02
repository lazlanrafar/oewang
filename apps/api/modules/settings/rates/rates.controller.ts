import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, status, t } from "elysia";
import { authPlugin } from "../../../plugins/auth";
import { encryptionPlugin } from "../../../plugins/encryption";
import { RatesService } from "./rates.service";

export const ratesController = new Elysia({
  prefix: "/rates",
  name: "rates.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ auth, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return RatesService.getExchangeRates(query.base);
    },
    {
      query: t.Object({
        base: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get exchange rates",
        tags: ["Settings", "Rates"],
      },
    },
  )
  .get(
    "/convert",
    async ({ auth, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }

      const { amount, from, to } = query;
      return RatesService.convertCurrency(amount, from, to);
    },
    {
      query: t.Object({
        amount: t.String(),
        from: t.String(),
        to: t.String(),
      }),
      detail: {
        summary: "Convert currency",
        tags: ["Settings", "Rates"],
      },
    },
  );
