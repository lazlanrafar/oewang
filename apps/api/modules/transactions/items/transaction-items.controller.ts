import { Elysia, t } from "elysia";
import { TransactionItemsService } from "./transaction-items.service";
import { TransactionItemDto } from "./transaction-items.dto";
import { authPlugin } from "../../../plugins/auth";
import { encryptionPlugin } from "../../../plugins/encryption";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { status } from "elysia";

export const transactionItemsController = new Elysia({
  prefix: "/:id/items",
  name: "transaction-items.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ auth, params: { id }, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionItemsService.list(auth.workspace_id, id, query);
    },
    {
      query: TransactionItemDto.listQuery,
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "List transaction items",
        description: "Returns all line items associated with the given transaction.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/",
    async ({ auth, params: { id }, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionItemsService.bulkCreate(
        auth.workspace_id,
        auth.user_id,
        id,
        [body],
      );
    },
    {
      body: TransactionItemDto.create,
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Create a transaction item",
        description: "Adds a single line item to a transaction.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/bulk",
    async ({ auth, params: { id }, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionItemsService.bulkCreate(
        auth.workspace_id,
        auth.user_id,
        id,
        body,
      );
    },
    {
      body: TransactionItemDto.bulkCreate,
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Bulk create transaction items (AI)",
        description: "Adds multiple line items at once. Used by the AI after parsing a receipt.",
        tags: ["Transactions"],
      },
    },
  )
  .delete(
    "/:itemId",
    async ({ auth, params: { id, itemId } }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionItemsService.delete(
        auth.workspace_id,
        auth.user_id,
        id,
        itemId,
      );
    },
    {
      params: t.Object({ id: t.String(), itemId: t.String() }),
      detail: {
        summary: "Delete a transaction item",
        description: "Soft-deletes a single line item from a transaction.",
        tags: ["Transactions"],
      },
    },
  );
