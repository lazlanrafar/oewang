import { Elysia, t } from "elysia";
import { TransactionsService } from "./transactions.service";
import { TransactionModel } from "./transactions.model";
import { ErrorCode } from "@workspace/types";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { status } from "elysia";
import { buildError } from "@workspace/utils";

// Factory function to create the transactions module
export const transactions = new Elysia({
  prefix: "/transactions",
  name: "transactions.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ auth, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionsService.list(auth.workspace_id, query);
    },
    {
      query: TransactionModel.listQuery,
      detail: {
        summary: "List transactions",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionsService.create(auth.workspace_id, auth.user_id, body);
    },
    {
      body: TransactionModel.create,
      detail: {
        summary: "Create transaction",
        tags: ["Transactions"],
      },
    },
  )
  .put(
    "/:id",
    async ({ auth, params: { id }, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }

      return TransactionsService.update(
        auth.workspace_id,
        auth.user_id,
        id,
        body,
      );
    },
    {
      body: TransactionModel.update,
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Update transaction",
        tags: ["Transactions"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ auth, params: { id } }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionsService.delete(auth.workspace_id, auth.user_id, id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete transaction",
        tags: ["Transactions"],
      },
    },
  );
