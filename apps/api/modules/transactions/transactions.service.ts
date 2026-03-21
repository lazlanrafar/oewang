import { TransactionsRepository } from "./transactions.repository";
import { ErrorCode } from "@workspace/types";
import type {
  CreateTransactionInput,
  GetTransactionsQueryInput,
  UpdateTransactionInput,
} from "./transactions.model";
import { walletsRepository } from "../wallets/wallets.repository";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import {
  buildPaginatedSuccess,
  buildSuccess,
  buildError,
} from "@workspace/utils";
import { status } from "elysia";

export abstract class TransactionsService {
  static async create(
    workspaceId: string,
    userId: string,
    body: CreateTransactionInput,
  ) {
    const amount =
      typeof body.amount === "number" ? body.amount.toString() : body.amount;

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
      await walletsRepository.updateBalance(body.walletId, workspaceId, -val);
    } else if (body.type === "income") {
      await walletsRepository.updateBalance(body.walletId, workspaceId, val);
    } else if (body.type === "transfer" && body.toWalletId) {
      await walletsRepository.updateBalance(body.walletId, workspaceId, -val);
      await walletsRepository.updateBalance(body.toWalletId, workspaceId, val);
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.created",
      entity: "transaction",
      entity_id: transaction.id,
      after: transaction,
    });

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
    const results: any[] = [];
    const errors: any[] = [];

    // Process in a loop to ensure balance updates and audit logs are handled correctly
    // We could optimize this later with bulk DB operations, but correctness
    // of balances is priority.
    for (const item of items) {
      try {
        const amount =
          typeof item.amount === "number"
            ? item.amount.toString()
            : item.amount;
        const toWalletId = item.toWalletId || undefined;
        const categoryId = item.categoryId || undefined;
        const assignedUserId = item.assignedUserId || userId;
        const { attachmentIds, ...dbBody } = item;

        const transaction = await TransactionsRepository.create({
          ...dbBody,
          workspaceId,
          amount,
          toWalletId,
          categoryId,
          assignedUserId,
        });

        const val = Number(amount);
        if (item.type === "expense") {
          await walletsRepository.updateBalance(
            item.walletId,
            workspaceId,
            -val,
          );
        } else if (item.type === "income") {
          await walletsRepository.updateBalance(
            item.walletId,
            workspaceId,
            val,
          );
        } else if (item.type === "transfer" && item.toWalletId) {
          await walletsRepository.updateBalance(
            item.walletId,
            workspaceId,
            -val,
          );
          await walletsRepository.updateBalance(
            item.toWalletId,
            workspaceId,
            val,
          );
        }

        await auditLogsService.log({
          workspace_id: workspaceId,
          user_id: userId,
          action: "transaction.imported",
          entity: "transaction",
          entity_id: transaction.id,
          after: transaction,
        });

        results.push(transaction);
      } catch (err: any) {
        errors.push({ item, error: err.message });
      }
    }

    return buildSuccess(
      {
        imported: results.length,
        failed: errors.length,
        transactions: results,
      },
      `Successfully imported ${results.length} transactions`,
    );
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

    const amount =
      typeof body.amount === "number" ? body.amount.toString() : body.amount;

    // Strip non-DB fields and empty strings before update
    const { attachmentIds, ...bodyWithoutAttachments } = body;
    const rawData: any = { ...bodyWithoutAttachments };
    if (amount !== undefined) rawData.amount = amount;

    const updateData = Object.fromEntries(
      Object.entries(rawData).filter(([_, v]) => v !== undefined && v !== ""),
    );

    const oldVal = Number(transaction.amount);
    if (transaction.type === "expense") {
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        oldVal,
      );
    } else if (transaction.type === "income") {
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        -oldVal,
      );
    } else if (transaction.type === "transfer" && transaction.toWalletId) {
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        oldVal,
      );
      await walletsRepository.updateBalance(
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
      await walletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        -newVal,
      );
    } else if (updated.type === "income") {
      await walletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        newVal,
      );
    } else if (updated.type === "transfer" && updated.toWalletId) {
      await walletsRepository.updateBalance(
        updated.walletId,
        workspaceId,
        -newVal,
      );
      await walletsRepository.updateBalance(
        updated.toWalletId,
        workspaceId,
        newVal,
      );
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.updated",
      entity: "transaction",
      entity_id: updated.id,
      before: transaction,
      after: updated,
    });

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
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        val,
      );
    } else if (transaction.type === "income") {
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        -val,
      );
    } else if (transaction.type === "transfer" && transaction.toWalletId) {
      await walletsRepository.updateBalance(
        transaction.walletId,
        workspaceId,
        val,
      );
      await walletsRepository.updateBalance(
        transaction.toWalletId,
        workspaceId,
        -val,
      );
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction.deleted",
      entity: "transaction",
      entity_id: id,
      before: transaction,
    });

    return buildSuccess(null, "Transaction deleted successfully");
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
