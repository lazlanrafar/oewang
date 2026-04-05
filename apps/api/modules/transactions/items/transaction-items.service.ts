import { TransactionItemsRepository } from "./transaction-items.repository";
import { TransactionsRepository } from "../transactions.repository";
import { AuditLogsService } from "../../audit-logs/audit-logs.service";
import { buildSuccess, buildPaginatedSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { status } from "elysia";
import type {
  BulkCreateTransactionItemsInput,
  TransactionItemsListQuery,
} from "./transaction-items.dto";

export abstract class TransactionItemsService {
  static async bulkCreate(
    workspaceId: string,
    userId: string,
    transactionId: string,
    items: BulkCreateTransactionItemsInput,
  ) {
    const transaction = await TransactionsRepository.findById(
      workspaceId,
      transactionId,
    );
    if (!transaction) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    const data = items.map((item) => ({
      workspaceId,
      transactionId,
      name: item.name,
      brand: item.brand ?? null,
      quantity: item.quantity != null ? String(item.quantity) : null,
      unit: item.unit ?? null,
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
      amount: String(item.amount),
      categoryId: item.categoryId ?? null,
      notes: item.notes ?? null,
    }));

    const created = await TransactionItemsRepository.bulkCreate(data);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction_items.bulk_created",
      entity: "transaction_item",
      entity_id: transactionId,
      after: { count: created.length, transactionId },
    });

    return buildSuccess(
      created,
      `${created.length} item${created.length !== 1 ? "s" : ""} added to transaction`,
      "CREATED",
    );
  }

  static async list(
    workspaceId: string,
    transactionId: string,
    query: TransactionItemsListQuery,
  ) {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 50;

    const transaction = await TransactionsRepository.findById(
      workspaceId,
      transactionId,
    );
    if (!transaction) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Transaction not found"),
      );
    }

    const { data, total } =
      await TransactionItemsRepository.findByTransactionId(
        workspaceId,
        transactionId,
        page,
        limit,
      );

    return buildPaginatedSuccess(
      data,
      { total, page, limit, total_pages: Math.ceil(total / limit) },
      "Transaction items retrieved successfully",
    );
  }

  static async delete(
    workspaceId: string,
    userId: string,
    transactionId: string,
    itemId: string,
  ) {
    const item = await TransactionItemsRepository.findById(
      workspaceId,
      transactionId,
      itemId,
    );
    if (!item) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Item not found"));
    }

    await TransactionItemsRepository.softDelete(
      workspaceId,
      transactionId,
      itemId,
    );

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "transaction_item.deleted",
      entity: "transaction_item",
      entity_id: itemId,
      before: item,
    });

    return buildSuccess(null, "Item deleted successfully");
  }

  static async search(workspaceId: string, query: string, limit = 10) {
    const items = await TransactionItemsRepository.search(
      workspaceId,
      query,
      limit,
    );
    return buildSuccess(items, "Items retrieved successfully");
  }
}
