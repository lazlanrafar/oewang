import { ordersRepository } from "./orders.repository";
import {
  buildSuccess,
  buildError,
  buildPaginatedSuccess,
  buildPagination,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export abstract class OrdersService {
  static async createOrderFromStripe(data: {
    workspace_id: string;
    user_id?: string;
    stripe_payment_intent_id?: string;
    stripe_invoice_id?: string;
    stripe_subscription_id?: string;
    amount: number;
    currency: string;
    status: string;
  }) {
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

    const order = await ordersRepository.create(data);
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

  static async getAllOrders(page: number, limit: number) {
    const result = await ordersRepository.findAll(page, limit);
    return buildSuccess(result, "Orders fetched");
  }

  static async getOrderDetails(id: string) {
    const order = await ordersRepository.findById(id);
    if (!order) {
      return buildError(ErrorCode.NOT_FOUND, "Order not found");
    }
    return buildSuccess(order, "Order details fetched");
  }
}
