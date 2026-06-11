import {
  and,
  billingInvoices,
  db,
  desc,
  eq,
  isNull,
  orders,
  pricing,
  sql,
  workspaces,
} from "@workspace/database";
import { logger } from "@workspace/logger";

type LineItem = {
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  meta?: Record<string, unknown>;
};

type IssueArgs = {
  workspaceId: string;
  workspaceName?: string | null;
  billingEmail?: string | null;
  orderId?: string | null;
  planId?: string | null;
  billingInterval?: "monthly" | "annual" | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  kind: "subscription" | "addon" | "one_time";
  lineItems: LineItem[];
  currency: string;
  taxAmount?: number;
  mayarTransactionId?: string | null;
  paidAt?: Date;
};

/**
 * Internal billing invoice service.
 *
 * We persist one row per paid order so users can view/download a real invoice
 * locally (with line items and tax) without depending on Mayar's portal. Mayar's
 * invoice URL is still saved as `mayarTransactionId` for cross-reference.
 */
export abstract class BillingInvoicesService {
  /**
   * Allocate the next per-workspace invoice sequence atomically.
   *
   * Postgres rejects `FOR UPDATE` combined with aggregate functions
   * (`MAX/COUNT/etc`), so we can't lock-and-aggregate in one query. Instead:
   *
   *   1. Take a transaction-scoped advisory lock keyed by the workspace id
   *      (hashed to a 32-bit int because the lock takes int4 args). The
   *      namespace constant `1` reserves this lock for billing-invoice work
   *      so unrelated advisory locks elsewhere don't collide.
   *   2. Inside the same transaction, read `MAX(sequence) + 1`.
   *
   * Concurrent issuances for the same workspace serialise on the lock — only
   * one ever sees the same MAX value. The lock is released at COMMIT/ROLLBACK.
   */
  private static async nextSequence(workspaceId: string): Promise<number> {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(1, hashtext(${workspaceId})::int4)`,
      );

      const result = await tx.execute(sql`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS next
        FROM billing_invoices
        WHERE workspace_id = ${workspaceId}
      `);
      const row = (result as any).rows?.[0] ?? (result as any)[0];
      return Number(row?.next ?? 1);
    });
  }

  private static formatInvoiceNumber(sequence: number, issuedAt: Date) {
    const year = issuedAt.getUTCFullYear();
    return `INV-${year}-${sequence.toString().padStart(5, "0")}`;
  }

  /**
   * Idempotent issue. If an invoice with the same `mayarTransactionId` already
   * exists for the workspace we return it instead of creating a duplicate.
   */
  static async issue(args: IssueArgs) {
    if (args.mayarTransactionId) {
      const existing = await db
        .select()
        .from(billingInvoices)
        .where(
          and(
            eq(billingInvoices.workspaceId, args.workspaceId),
            eq(billingInvoices.mayarTransactionId, args.mayarTransactionId),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];
    }

    const subtotal = args.lineItems.reduce((sum, li) => sum + li.amount, 0);
    const taxAmount = args.taxAmount ?? 0;
    const total = subtotal + taxAmount;

    const issuedAt = args.paidAt ?? new Date();
    const sequence = await BillingInvoicesService.nextSequence(args.workspaceId);
    const invoiceNumber = BillingInvoicesService.formatInvoiceNumber(
      sequence,
      issuedAt,
    );

    const [row] = await db
      .insert(billingInvoices)
      .values({
        workspaceId: args.workspaceId,
        orderId: args.orderId ?? null,
        invoiceNumber,
        sequence,
        planId: args.planId ?? null,
        billingInterval: args.billingInterval ?? null,
        periodStart: args.periodStart ?? null,
        periodEnd: args.periodEnd ?? null,
        kind: args.kind,
        lineItems: args.lineItems,
        subtotal,
        taxAmount,
        total,
        currency: args.currency,
        billingEmail: args.billingEmail ?? null,
        workspaceName: args.workspaceName ?? null,
        mayarTransactionId: args.mayarTransactionId ?? null,
        paidAt: issuedAt,
      })
      .returning();

    logger.info("[BillingInvoices] Issued", {
      workspaceId: args.workspaceId,
      invoiceNumber,
      total,
    });

    return row;
  }

  /**
   * Backfill `billing_invoices` rows for paid `orders` that don't yet have one.
   * Cheap to run on every list call — gated by `LEFT JOIN ... IS NULL` so it's
   * a no-op once everything is in sync. Handles two cases:
   *   1. Orders created before the `billing_invoices` table was added
   *   2. Webhooks that processed successfully but failed at the invoice step
   *      (it's caught + logged as non-fatal there to avoid blocking activation)
   */
  static async backfillFromOrders(workspaceId: string) {
    const pending = await db
      .select({
        order_id: orders.id,
        mayar_invoice_id: orders.mayar_invoice_id,
        mayar_transaction_id: orders.mayar_transaction_id,
        amount: orders.amount,
        currency: orders.currency,
        created_at: orders.created_at,
      })
      .from(orders)
      .leftJoin(
        billingInvoices,
        and(
          eq(billingInvoices.workspaceId, orders.workspace_id),
          eq(billingInvoices.orderId, orders.id),
        ),
      )
      .where(
        and(
          eq(orders.workspace_id, workspaceId),
          eq(orders.status, "paid"),
          isNull(orders.deleted_at),
          isNull(billingInvoices.id),
        ),
      );

    if (pending.length === 0) return 0;

    const [ws] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        plan_id: workspaces.plan_id,
        plan_billing_interval: workspaces.plan_billing_interval,
        plan_started_at: workspaces.plan_started_at,
        plan_current_period_end: workspaces.plan_current_period_end,
        mayar_customer_email: workspaces.mayar_customer_email,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!ws) return 0;

    const planRows = ws.plan_id
      ? await db
          .select()
          .from(pricing)
          .where(eq(pricing.id, ws.plan_id))
          .limit(1)
      : [];
    const currentPlan = planRows[0];

    let issued = 0;
    for (const order of pending) {
      // Best-effort description: use the workspace's current plan name if we
      // can't tell which specific plan the order paid for. For older orders
      // without metadata this is the best we have.
      const description = currentPlan
        ? `${currentPlan.name} — ${ws.plan_billing_interval === "annual" ? "Annual" : "Monthly"} subscription`
        : `Payment ${order.mayar_invoice_id ?? order.order_id}`;

      try {
        await BillingInvoicesService.issue({
          workspaceId,
          workspaceName: ws.name,
          billingEmail: ws.mayar_customer_email,
          orderId: order.order_id,
          planId: currentPlan?.id ?? null,
          billingInterval: ws.plan_billing_interval,
          periodStart: ws.plan_started_at ?? null,
          periodEnd: ws.plan_current_period_end ?? null,
          kind: currentPlan?.is_addon
            ? "addon"
            : currentPlan
              ? "subscription"
              : "one_time",
          currency: (order.currency || "IDR").toUpperCase(),
          mayarTransactionId:
            order.mayar_transaction_id || order.mayar_invoice_id,
          paidAt: order.created_at,
          lineItems: [
            {
              description,
              quantity: 1,
              unit_amount: order.amount,
              amount: order.amount,
              meta: { backfilled: true, plan_id: currentPlan?.id },
            },
          ],
        });
        issued += 1;
      } catch (err) {
        logger.warn("[BillingInvoices] Backfill failed for order", {
          workspaceId,
          orderId: order.order_id,
          err,
        });
      }
    }

    if (issued > 0) {
      logger.info(`[BillingInvoices] Backfilled ${issued} invoice(s)`, {
        workspaceId,
      });
    }
    return issued;
  }

  static async listForWorkspace(workspaceId: string, limit = 50) {
    // Lazily fill in any missing invoices before listing
    await BillingInvoicesService.backfillFromOrders(workspaceId);

    return db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.workspaceId, workspaceId),
          sql`${billingInvoices.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(billingInvoices.createdAt))
      .limit(limit);
  }

  static async findById(workspaceId: string, id: string) {
    const [row] = await db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.workspaceId, workspaceId),
          eq(billingInvoices.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Lookup by associated order — used by the billing history "View" button. */
  static async findByOrderId(workspaceId: string, orderId: string) {
    const [row] = await db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.workspaceId, workspaceId),
          eq(billingInvoices.orderId, orderId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
