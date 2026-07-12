import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { OrdersRepository } from "./orders.repository";

// Orders are largely payment-provider (Mayar webhook) driven, so the actor may
// be the system rather than a signed-in user — fall back to "system".
const SYSTEM_ACTOR = "system";

export abstract class OrdersService {
  static async createOrder(
    data: {
      workspace_id: string;
      user_id?: string;
      mayar_payment_id?: string;
      mayar_invoice_id?: string;
      mayar_transaction_id?: string;
      amount: number;
      currency: string;
      status: string;
    },
    tx?: any,
  ) {
    // If invoice ID exists (Mayar), try updating first
    const invoiceId = data.mayar_invoice_id;
    if (invoiceId) {
      const existing = await OrdersRepository.findByInvoiceId(invoiceId);
      if (existing) {
        const updated = await OrdersRepository.updateByMayarInvoiceId(
          invoiceId,
          { status: data.status, amount: data.amount, currency: data.currency },
        );
        await AuditLogsService.log({
          workspace_id: data.workspace_id,
          user_id: data.user_id ?? SYSTEM_ACTOR,
          action: "order.updated",
          entity: "order",
          entity_id: existing.id,
          before: existing,
          after: updated,
        });
        return buildSuccess(updated, "Order updated");
      }
    }

    const order = await OrdersRepository.create(data, tx);
    await AuditLogsService.log({
      workspace_id: data.workspace_id,
      user_id: data.user_id ?? SYSTEM_ACTOR,
      action: "order.created",
      entity: "order",
      entity_id: order.id,
      after: order,
    });
    return buildSuccess(order, "Order created");
  }

  static async updateOrderFromInvoiceId(invoiceId: string, status: string) {
    const updated = await OrdersRepository.updateByMayarInvoiceId(invoiceId, {
      status,
    });

    if (!updated) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
    await AuditLogsService.log({
      workspace_id: updated.workspace_id ?? "",
      user_id: updated.user_id ?? SYSTEM_ACTOR,
      action: "order.updated",
      entity: "order",
      entity_id: updated.id,
      after: updated,
    });
    return buildSuccess(updated, "Order updated");
  }

  static async getAllOrders(
    page: number,
    limit: number,
    search?: string,
    status?: string,
    start?: string,
    end?: string,
    attachments?: string,
    manual?: string,
  ) {
    const result = await OrdersRepository.findAll(
      page,
      limit,
      search,
      status,
      start,
      end,
      attachments,
      manual,
    );
    return buildPaginatedSuccess(
      result.rows,
      buildPagination(result.total, page, limit),
      "Orders fetched",
    );
  }

  static async getStats(start?: string, end?: string) {
    const stats = await OrdersRepository.getStats(start, end);
    return buildSuccess(stats, "Order stats fetched");
  }

  static async getOrderDetails(id: string) {
    const order = await OrdersRepository.findById(id);
    if (!order) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
    return buildSuccess(order, "Order details fetched");
  }

  static async getWorkspaceOrders(workspaceId: string) {
    const orders = await OrdersRepository.findByWorkspaceId(workspaceId);
    return buildSuccess(orders, "Workspace orders fetched");
  }

  static async orderExistsForInvoice(invoiceId: string): Promise<boolean> {
    const order = await OrdersRepository.findByInvoiceId(invoiceId);
    return !!order;
  }
}
