import { Elysia, t } from "elysia";
import { TransactionsService } from "./transactions.service";
import { TransactionsImportService } from "./transactions.import.service";
import { TransactionModel } from "./transactions.model";
import { ErrorCode } from "@workspace/types";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { status } from "elysia";
import { buildError } from "@workspace/utils";
import { transactionItemsController } from "./items/transaction-items.controller";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

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
        description: "Returns a paginated list of transactions for the active workspace, with optional filtering by wallet, category, and date range.",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/export",
    async ({ auth, query }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      
      const csvData = await TransactionsService.export(auth.workspace_id, query);
      return new Response(csvData, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="transactions.csv"',
        },
      });
    },
    {
      query: TransactionModel.exportQuery,
      detail: {
        summary: "Export transactions to CSV",
        description: "Returns a CSV file containing the workspace's transactions.",
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
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsService.create(auth.workspace_id, auth.user_id, body);
    },
    {
      body: TransactionModel.create,
      detail: {
        summary: "Create transaction",
        description: "Creates a new transaction (income, expense, or transfer) and automatically updates the associated wallet balances.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/bulk",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsService.bulkCreate(
        auth.workspace_id,
        auth.user_id,
        body,
      );
    },
    {
      body: TransactionModel.bulkCreate,
      detail: {
        summary: "Bulk create transactions",
        description: "Creates multiple transactions in a single request. Useful for batch imports or initial data setup.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/bulk-delete",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsService.bulkDelete(
        auth.workspace_id,
        auth.user_id,
        body.ids,
      );
    },
    {
      body: TransactionModel.bulkDelete,
      detail: {
        summary: "Bulk delete transactions",
        description: "Soft-deletes multiple transactions in one request and recalculates balances.",
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
      assertCanEditWorkspaceData(auth.workspace_role);

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
        description: "Updates an existing transaction. If the amount or type changes, wallet balances are recalculated accordingly.",
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
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsService.delete(auth.workspace_id, auth.user_id, id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete transaction",
        description: "Soft-deletes a transaction and reverts any balance changes made to associated wallets.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/import",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      const file = body.file as File;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return TransactionsImportService.importFromFile(
        auth.workspace_id,
        auth.user_id,
        buffer,
        file.type || "application/octet-stream",
        file.name || "upload",
      );
    },
    {
      body: t.Object({
        file: t.File(),
      }),
      detail: {
        summary: "Import transactions (AI)",
        description: "Analyzes an uploaded bank statement image or PDF using AI to extract and import transactions automatically.",
        tags: ["Transactions"],
      },
    },
  )
  .get(
    "/:id/debts",
    async ({ auth, params: { id } }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return TransactionsService.getDebts(auth.workspace_id, id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get transaction debts",
        description: "Returns all debt records (loans/payables) that are linked to this specific transaction.",
        tags: ["Transactions"],
      },
    },
  )
  .use(transactionItemsController);
