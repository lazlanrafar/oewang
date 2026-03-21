import { ordersRepository } from "./orders.repository";
import {
  buildSuccess,
  buildError,
  buildPaginatedSuccess,
  buildPagination,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export abstract class OrdersService {
  static async createOrderFromStripe(
    data: {
      workspace_id: string;
      user_id?: string;
      stripe_payment_intent_id?: string;
      stripe_invoice_id?: string;
      stripe_subscription_id?: string;
      amount: number;
      currency: string;
      status: string;
    },
    tx?: any,
  ) {
    // If invoice ID exists, try updatng first, otherwise create
    if (data.stripe_invoice_id) {
      const existing = await ordersRepository.findByInvoiceId(
        data.stripe_invoice_id,
      );
      if (existing) {
        const updated = await ordersRepository.updateByStripeInvoiceId(
          data.stripe_invoice_id,
          {
            status: data.status,
            amount: data.amount,
            currency: data.currency,
          },
        );
        return buildSuccess(updated, "Order updated");
      }
    }

    const order = await ordersRepository.create(data, tx);
    return buildSuccess(order, "Order created");
  }

  static async updateOrderFromStripe(stripeInvoiceId: string, status: string) {
    const order = await ordersRepository.updateByStripeInvoiceId(
      stripeInvoiceId,
      { status },
    );
    if (!order) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
    return buildSuccess(order, "Order updated");
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
    const result = await ordersRepository.findAll(
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
    const order = await ordersRepository.findById(id);
    if (!order) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
    return buildSuccess(order, "Order details fetched");
  }
  static async getWorkspaceOrders(workspaceId: string) {
    const orders = await ordersRepository.findByWorkspaceId(workspaceId);
    return buildSuccess(orders, "Workspace orders fetched");
  }
}
