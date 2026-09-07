import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, status } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";
import { TransactionReviewModel } from "./transactions.model";
import { TransactionsReviewService } from "./transactions-review.service";

// AI/statistical review of already-mapped import rows, run between the CSV
// wizard's Summary step and the final /transactions/bulk commit. Read-only:
// no row is ever written here, no AuditLogsService call needed.
export const transactionsReviewController = new Elysia({
  prefix: "/import-review",
  name: "transactions-review.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/duplicates",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsReviewService.checkDuplicates(
        auth.workspace_id,
        body.rows,
      );
    },
    {
      body: TransactionReviewModel.duplicatesCheck,
      detail: {
        summary: "Check import rows for likely duplicates",
        description:
          "Pure DB comparison against existing transactions in the same wallets/date window — no AI call.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/categorize",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsReviewService.categorize(
        auth.workspace_id,
        body.rows,
      );
    },
    {
      body: TransactionReviewModel.categorize,
      detail: {
        summary: "Suggest categories and flag type/sign issues",
        description:
          "Deterministic sign checks plus an AI category suggestion for rows left uncategorized.",
        tags: ["Transactions"],
      },
    },
  )
  .post(
    "/anomalies",
    async ({ auth, body }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return TransactionsReviewService.anomalies(auth.workspace_id, body.rows);
    },
    {
      body: TransactionReviewModel.anomalies,
      detail: {
        summary: "Flag unusually large expense rows",
        description:
          "Scores incoming expense rows against the workspace's own history via a statistical model — no AI/LLM call.",
        tags: ["Transactions"],
      },
    },
  );
