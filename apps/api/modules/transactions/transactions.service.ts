import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildSuccess,
} from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { BudgetsRepository } from "../budgets/budgets.repository";
import { BudgetsService } from "../budgets/budgets.service";
import { MetricsService } from "../metrics/metrics.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { WalletsRepository } from "../wallets/wallets.repository";

const log = createLogger("transactions");
import type {
  CreateTransactionInput,
  ExportTransactionsQueryInput,
  GetTransactionsQueryInput,
  UpdateTransactionInput,
} from "./transactions.model";
import { TransactionsRepository } from "./transactions.repository";

type MulticurrencyFields = {
  amount: string;
  originalAmount: string | null;
  originalCurrencyCode: string | null;
  exchangeRate: string | null;
};

// Derive the main-currency amount and the three nullable original-currency
// fields. When the user picks a non-main currency the client sends
// originalAmount + exchangeRate; we re-compute `amount` server-side so the
// stored main-currency value can't be tampered with from the client.
function resolveMulticurrency(input: {
  amount: number | string;
  originalAmount?: number | string | null;
  originalCurrencyCode?: string | null;
  exchangeRate?: number | string | null;
}): MulticurrencyFields {
  const hasOriginal =
    input.originalCurrencyCode != null &&
    input.originalAmount != null &&
    input.exchangeRate != null;

  if (hasOriginal) {
    const origNum = Number(input.originalAmount);
    const rateNum = Number(input.exchangeRate);
    const main = (origNum * rateNum).toFixed(4);
    return {
      amount: main,
      originalAmount: origNum.toString(),
      originalCurrencyCode: input.originalCurrencyCode as string,
      exchangeRate: rateNum.toString(),
    };
  }

  return {
    amount:
      typeof input.amount === "number" ? input.amount.toString() : input.amount,
    originalAmount: null,
    originalCurrencyCode: null,
    exchangeRate: null,
  };
}

export abstract class TransactionsService {
  static async create(
    workspaceId: string,
    userId: string,
    body: CreateTransactionInput,
  ) {
    const {
      amount,
      originalAmount,
      originalCurrencyCode,
      exchangeRate,
    } = resolveMulticurrency(body);

    // Sanitize optional UUID fields: empty strings from the frontend are not valid UUIDs.
    const toWalletId = body.toWalletId || undefined;
    const categoryId = body.categoryId || undefined;
    const assignedUserId = body.assignedUserId || userId;
    // Strip non-DB fields before insert
    const { attachmentIds, ...dbBody } = body;

    const transaction = await TransactionsRepository.create({
      ...dbBody,
      workspaceId,
      amount,
      originalAmount,
      originalCurrencyCode,
      exchangeRate,
      toWalletId,
      categoryId,
      assignedUserId,
    });

    // Sync attachments
    if (attachmentIds && attachmentIds.length > 0) {
      await TransactionsRepository.syncAttachments(
        transaction.id,
        workspaceId,
        attachmentIds,
      );
    }

    const val = Number(amount);

    if (body.type === "expense") {
      await WalletsRepository.updateBalance(body.walletId, workspaceId, -val);
    } else if (body.type === "income") {
      await WalletsRepository.updateBalance(body.walletId, workspaceId, val);
    } else if (body.type === "transfer" && body.toWalletId) {
      await WalletsRepository.updateBalance(body.walletId, workspaceId, -val);
      await WalletsRepository.updateBalance(body.toWalletId, workspaceId, val);
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.created",
      entity: "transaction",
      entity_id: transaction.id,
      after: transaction,
    });

    await NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "transaction.created",
      title: "New Transaction",
      message: `A new ${body.type} of ${amount} was recorded.`,
      link: "/transactions",
    });

    // Check if this expense exceeds an active budget
    if (body.type === "expense" && categoryId) {
      const budget = await BudgetsRepository.findByCategory(
        categoryId,
        workspaceId,
      );
      if (budget) {
        const now = new Date();
        const startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
        ).toISOString();
        const endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        ).toISOString();
        const budgetStatuses = await BudgetsRepository.getStatus(
          workspaceId,
          startDate,
          endDate,
        );
        const budgetStatus = budgetStatuses.find(
          (s) => s.categoryId === categoryId,
        );
        if (
          budgetStatus &&
          Number(budgetStatus.spent) >= Number(budgetStatus.amount)
        ) {
          await NotificationsService.create({
            workspace_id: workspaceId,
            user_id: userId,
            type: "budget.exceeded",
            title: "Budget Exceeded",
            message: `Your ${budgetStatus.categoryName} budget of ${Number(budgetStatus.amount).toLocaleString()} has been exceeded this month.`,
            link: "/budget",
          });
        }
      }
    }

    RealtimeService.notifyValueChange(workspaceId, "transactions");
    RealtimeService.notifyValueChange(workspaceId, "wallets");

    await Promise.all([
      MetricsService.invalidateWorkspaceCache(workspaceId),
      BudgetsService.invalidateCurrentMonthCache(workspaceId),
    ]);

    return buildSuccess(
      transaction,
      "Transaction created successfully",
      "CREATED",
    );
  }

  static async bulkCreate(
    workspaceId: string,
    userId: string,
    items: CreateTransactionInput[],
  ) {
    if (items.length === 0) {
      return buildSuccess(
        { imported: 0, failed: 0, transactions: [], failures: [] },
        "Successfully imported 0 transactions",
      );
    }

    const failures: { index: number; reason: string }[] = [];
    const validItems: { index: number; item: CreateTransactionInput }[] = [];

    // Pre-validation phase
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (!item.walletId) {
        failures.push({ index: i, reason: "Account is required" });
        continue;
      }
      if (!item.amount || isNaN(Number(item.amount))) {
        failures.push({ index: i, reason: "Invalid amount" });
        continue;
      }
      if (!item.date) {
        failures.push({ index: i, reason: "Date is required" });
        continue;
      }
      if (!item.type) {
        failures.push({ index: i, reason: "Type is required" });
        continue;
      }
      validItems.push({ index: i, item });
    }

    if (validItems.length === 0) {
      return buildSuccess(
        { imported: 0, failed: failures.length, transactions: [], failures },
        "All transactions failed validation",
      );
    }

    try {
      return await TransactionsRepository.runTransaction(async (tx) => {
        const walletDeltas: Record<string, number> = {};
        const dbTransactionsToInsert: any[] = [];

        for (const { item } of validItems) {
          const {
            amount: amountStr,
            originalAmount,
            originalCurrencyCode,
            exchangeRate,
          } = resolveMulticurrency(item);
          const toWalletId = item.toWalletId || undefined;
          const categoryId = item.categoryId || undefined;
          const assignedUserId = item.assignedUserId || userId;
          const { attachmentIds, ...dbBody } = item;

          dbTransactionsToInsert.push({
            ...dbBody,
            workspaceId,
            amount: amountStr,
            originalAmount,
            originalCurrencyCode,
            exchangeRate,
            toWalletId,
            categoryId,
            assignedUserId,
          });

          const val = Number(amountStr);
          if (item.type === "expense") {
            walletDeltas[item.walletId] =
              (walletDeltas[item.walletId] || 0) - val;
          } else if (item.type === "income") {
            walletDeltas[item.walletId] =
              (walletDeltas[item.walletId] || 0) + val;
          } else if (item.type === "transfer" && item.toWalletId) {
            walletDeltas[item.walletId] =
              (walletDeltas[item.walletId] || 0) - val;
            walletDeltas[item.toWalletId] =
              (walletDeltas[item.toWalletId] || 0) + val;
          }
        }

        // 1. Bulk insert transactions
        const results = await TransactionsRepository.createMany(
          dbTransactionsToInsert,
          tx,
        );

        // 2. Apply batched wallet balance updates
        const walletUpdatePromises = Object.entries(walletDeltas).map(
          ([wId, diff]) => {
            if (diff === 0) return Promise.resolve();
            return WalletsRepository.updateBalance(wId, workspaceId, diff, tx);
          },
        );
        await Promise.all(walletUpdatePromises);

        // 3. Prepare and bulk insert audit logs
        const auditLogsToInsert = results.map((transaction) => ({
          workspace_id: workspaceId,
          user_id: userId,
          action: "transaction.imported",
          entity: "transaction",
          entity_id: transaction.id,
          after: transaction,
        }));
        await AuditLogsService.logMany(auditLogsToInsert);

        // 4. Notify listeners (outside tx if needed, but here fine)
        RealtimeService.notifyValueChange(workspaceId, "transactions");
        RealtimeService.notifyValueChange(workspaceId, "wallets");

        await Promise.all([
          MetricsService.invalidateWorkspaceCache(workspaceId),
          BudgetsService.invalidateCurrentMonthCache(workspaceId),
        ]);

        return buildSuccess(
          {
            imported: results.length,
            failed: failures.length,
            transactions: results,
            failures,
          },
          `Successfully imported ${results.length} transactions`,
        );
      });
    } catch (err: any) {
      log.error("Bulk create failed", { err });
      return buildError(
        ErrorCode.INTERNAL_ERROR,
        `Import failed: ${err.message || "Unknown error"}`,
      );
    }
  }

  static async list(workspaceId: string, query: GetTransactionsQueryInput) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;

    const { data, total } = await TransactionsRepository.list(workspaceId, {
      ...query,
      page,
      limit,
    });

    const total_pages = Math.ceil(total / limit);

    return buildPaginatedSuccess(
      data,
      {
        total,
        page,
        limit,
        total_pages,
      },
      "Transactions retrieved successfully",
    );
  }

  static async export(
    workspaceId: string,
    query: ExportTransactionsQueryInput,
  ) {
    const { data } = await TransactionsRepository.list(workspaceId, {
      page: 1,
      limit: 100000,
      startDate: query.allData === true ? undefined : query.startDate,
      endDate: query.allData === true ? undefined : query.endDate,
    });

    // Create CSV payload
    const headers = [
      "Date",
      "Type",
      "Amount",
      "Category",
      "Wallet",
      "To Wallet",
      "Description",
    ];
    const rows = data.map((t: any) => {
      return [
        t.date ? new Date(t.date).toISOString().split("T")[0] : "",
        t.type || "",
        t.amount || "0",
        t.category?.name || "",
        t.wallet?.name || "",
        t.toWallet?.name || "",
        `"${(t.description || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }

  static async update(
    workspaceId: string,
    userId: string,
    id: string,
    body: UpdateTransactionInput,
  ) {
    const transaction = await TransactionsRepository.findById(workspaceId, id);
    if (!transaction) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    // Strip non-DB fields and empty strings before update
    const { attachmentIds, ...bodyWithoutAttachments } = body;
    const rawData: any = { ...bodyWithoutAttachments };

    // Re-derive main-currency `amount` and the three original-currency fields
    // whenever the client touches any of them. If the caller explicitly sends
    // originalCurrencyCode = null we clear the multicurrency state.
    const touchesCurrency =
      body.amount !== undefined ||
      body.originalAmount !== undefined ||
      body.originalCurrencyCode !== undefined ||
      body.exchangeRate !== undefined;

    if (touchesCurrency) {
      const merged = resolveMulticurrency({
        amount: body.amount ?? transaction.amount,
        originalAmount:
          body.originalAmount !== undefined
            ? body.originalAmount
            : transaction.originalAmount,
        originalCurrencyCode:
          body.originalCurrencyCode !== undefined
            ? body.originalCurrencyCode
            : transaction.originalCurrencyCode,
        exchangeRate:
          body.exchangeRate !== undefined
            ? body.exchangeRate
            : transaction.exchangeRate,
      });
      rawData.amount = merged.amount;
      rawData.originalAmount = merged.originalAmount;
      rawData.originalCurrencyCode = merged.originalCurrencyCode;
      rawData.exchangeRate = merged.exchangeRate;
    }

    const updateData = Object.fromEntries(
      Object.entries(rawData).filter(([k, v]) => {
        if (v === undefined) return false;
        // Allow empty strings for text fields, but filter them out for UUID fields
        if (
          v === "" &&
          ["walletId", "toWalletId", "categoryId", "assignedUserId"].includes(k)
        ) {
          return false;
        }
        return true;
      }),
    );

    const oldVal = Number(transaction.amount);
    if (transaction.type === "expense") {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        oldVal,
      );
    } else if (transaction.type === "income") {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        -oldVal,
      );
    } else if (transaction.type === "transfer" && transaction.toWalletId) {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        oldVal,
      );
      await WalletsRepository.updateBalance(
        transaction.toWalletId,
        workspaceId,
        -oldVal,
      );
    }

    const updated = await TransactionsRepository.update(
      workspaceId,
      id,
      updateData as any,
    );

    if (!updated) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    // Sync attachments if provided
    if (attachmentIds !== undefined) {
      await TransactionsRepository.syncAttachments(
        id,
        workspaceId,
        attachmentIds,
      );
    }

    const newVal = Number(updated.amount);

    if (updated.type === "expense") {
      await WalletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        -newVal,
      );
    } else if (updated.type === "income") {
      await WalletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        newVal,
      );
    } else if (updated.type === "transfer" && updated.toWalletId) {
      await WalletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        -newVal,
      );
      await WalletsRepository.updateBalance(
        updated.toWalletId,
        workspaceId,
        newVal,
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.updated",
      entity: "transaction",
      entity_id: updated.id,
      before: transaction,
      after: updated,
    });

    RealtimeService.notifyValueChange(workspaceId, "transactions");
    RealtimeService.notifyValueChange(workspaceId, "wallets");

    await Promise.all([
      MetricsService.invalidateWorkspaceCache(workspaceId),
      BudgetsService.invalidateCurrentMonthCache(workspaceId),
    ]);

    return buildSuccess(updated, "Transaction updated successfully");
  }

  static async delete(workspaceId: string, userId: string, id: string) {
    const transaction = await TransactionsRepository.findById(workspaceId, id);
    if (!transaction) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    await TransactionsRepository.delete(workspaceId, id);

    const val = Number(transaction.amount);

    if (transaction.type === "expense") {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        val,
      );
    } else if (transaction.type === "income") {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        -val,
      );
    } else if (transaction.type === "transfer" && transaction.toWalletId) {
      await WalletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        val,
      );
      await WalletsRepository.updateBalance(
        transaction.toWalletId,
        workspaceId,
        -val,
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.deleted",
      entity: "transaction",
      entity_id: id,
      before: transaction,
    });

    RealtimeService.notifyValueChange(workspaceId, "transactions");
    RealtimeService.notifyValueChange(workspaceId, "wallets");

    await Promise.all([
      MetricsService.invalidateWorkspaceCache(workspaceId),
      BudgetsService.invalidateCurrentMonthCache(workspaceId),
    ]);

    return buildSuccess(null, "Transaction deleted successfully");
  }

  static async bulkDelete(workspaceId: string, userId: string, ids: string[]) {
    if (ids.length === 0) {
      return buildSuccess({ deleted: 0 }, "No transactions to delete");
    }

    try {
      return await TransactionsRepository.runTransaction(async (tx) => {
        // Attempt to soft-delete them all in one operation within the transaction
        const deletedTransactions = await TransactionsRepository.deleteMany(
          workspaceId,
          ids,
          tx,
        );

        if (deletedTransactions.length === 0) {
          return buildSuccess({ deleted: 0 }, "No matching transactions found");
        }

        const walletDeltas: Record<string, number> = {};
        const auditLogsToInsert: any[] = [];

        // Calculate reverse net wallet changes
        for (const transaction of deletedTransactions) {
          const val = Number(transaction.amount);

          if (transaction.type === "expense") {
            walletDeltas[transaction.walletId] =
              (walletDeltas[transaction.walletId] || 0) + val;
          } else if (transaction.type === "income") {
            walletDeltas[transaction.walletId] =
              (walletDeltas[transaction.walletId] || 0) - val;
          } else if (
            transaction.type === "transfer" &&
            transaction.toWalletId
          ) {
            walletDeltas[transaction.walletId] =
              (walletDeltas[transaction.walletId] || 0) + val;
            walletDeltas[transaction.toWalletId] =
              (walletDeltas[transaction.toWalletId] || 0) - val;
          }

          auditLogsToInsert.push({
            workspace_id: workspaceId,
            user_id: userId,
            action: "transaction.deleted",
            entity: "transaction",
            entity_id: transaction.id,
            before: transaction,
          });
        }

        // Apply batched wallet balance updates safely via Promise.all within tx
        const walletUpdatePromises = Object.entries(walletDeltas).map(
          ([wId, diff]) => {
            if (diff === 0) return Promise.resolve();
            return WalletsRepository.updateBalance(wId, workspaceId, diff, tx);
          },
        );
        await Promise.all(walletUpdatePromises);

        // Bulk insert audit logs within tx
        await AuditLogsService.logMany(auditLogsToInsert);

        RealtimeService.notifyValueChange(workspaceId, "transactions");
        RealtimeService.notifyValueChange(workspaceId, "wallets");

        await Promise.all([
          MetricsService.invalidateWorkspaceCache(workspaceId),
          BudgetsService.invalidateCurrentMonthCache(workspaceId),
        ]);

        return buildSuccess(
          { deleted: deletedTransactions.length },
          `Successfully deleted ${deletedTransactions.length} transactions`,
        );
      });
    } catch (err: any) {
      log.error("Bulk delete failed", { err });
      return buildError(
        ErrorCode.INTERNAL_ERROR,
        `Delete failed: ${err.message || "Unknown error"}`,
      );
    }
  }

  static async getDebts(workspaceId: string, id: string) {
    const transaction = await TransactionsRepository.findById(workspaceId, id);
    if (!transaction) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    const debts = await TransactionsRepository.findDebts(id, workspaceId);
    return buildSuccess(debts, "Transaction debts retrieved successfully");
  }
}
