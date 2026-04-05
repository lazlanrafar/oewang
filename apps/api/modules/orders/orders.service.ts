import { OrdersRepository } from "./orders.repository";
import {
  buildSuccess,
  buildError,
  buildPaginatedSuccess,
  buildPagination,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export abstract class OrdersService {
  static async createOrder(
    data: {
      workspace_id: string;
      user_id?: string;
      xendit_payment_id?: string;
      xendit_invoice_id?: string;
      xendit_subscription_id?: string;
      amount: number;
      currency: string;
      status: string;
    },
    tx?: any,
  ) {
    // If invoice ID exists (Xendit), try updating first
    const invoiceId = data.xendit_invoice_id;
    if (invoiceId) {
      const existing = await OrdersRepository.findByInvoiceId(invoiceId);
      if (existing) {
        const updated = await OrdersRepository.updateByXenditInvoiceId(
          invoiceId,
          { status: data.status, amount: data.amount, currency: data.currency }
        );
        return buildSuccess(updated, "Order updated");
      }
    }

    const order = await OrdersRepository.create(data, tx);
    return buildSuccess(order, "Order created");
  }

  static async updateOrderFromInvoiceId(invoiceId: string, status: string) {
    const updated = await OrdersRepository.updateByXenditInvoiceId(invoiceId, { status });

    if (!updated) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
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
}
