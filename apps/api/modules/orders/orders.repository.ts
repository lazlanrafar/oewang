import {
  db,
  eq,
  desc,
  orders,
  workspaces,
  users,
  and,
  or,
  ilike,
  gte,
  lte,
  sql,
  isNull,
} from "@workspace/database";

/**
 * Orders repository — ONLY layer with DB access.
 */
export abstract class OrdersRepository {
  static async create(data: typeof orders.$inferInsert, tx: any = db) {
    const [order] = await tx.insert(orders).values(data).returning();
    return order;
  }


  static async updateByXenditInvoiceId(
    invoiceId: string,
    data: Partial<typeof orders.$inferInsert>,
  ) {
    const [order] = await db
      .update(orders)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orders.xendit_invoice_id, invoiceId))
      .returning();
    return order;
  }

  static async updateByPaymentIntentId(
    paymentIntentId: string,
    data: Partial<typeof orders.$inferInsert>,
  ) {
    const [order] = await db
      .update(orders)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orders.xendit_payment_id, paymentIntentId))
      .returning();
    return order;
  }

  static async findAll(
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    start?: string,
    end?: string,
    attachments?: string,
    manual?: string,
  ) {
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (search) {
      const searchPattern = `%${search}%`;
      const codeSql = sql<string>`'INV' || to_char(${orders.created_at}, 'IYYY') || lpad(${orders.sequence_number}::text, 4, '0')`;
      conditions.push(
        or(
          ilike(users.email, searchPattern),
          ilike(users.name, searchPattern),
          ilike(codeSql, searchPattern),
        ),
      );
    }

    if (status) {
      conditions.push(eq(orders.status, status));
    }

    if (attachments === "include") {
      conditions.push(
        or(
          sql`${orders.xendit_invoice_id} IS NOT NULL`,
          sql`${orders.xendit_payment_id} IS NOT NULL`
        )
      );
    } else if (attachments === "exclude") {
      conditions.push(
        and(
          sql`${orders.xendit_invoice_id} IS NULL`,
          sql`${orders.xendit_payment_id} IS NULL`
        )
      );
    }

    if (manual === "include") {
      conditions.push(eq(orders.manual, true));
    } else if (manual === "exclude") {
      conditions.push(eq(orders.manual, false));
    }

    if (start) {
      conditions.push(gte(orders.created_at, new Date(start)));
    }

    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.created_at, endDate));
    }

    const whereClause = and(
      isNull(orders.deleted_at),
      ...(conditions.length > 0 ? conditions : []),
    );

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .leftJoin(users, eq(orders.user_id, users.id))
      .where(whereClause);

    const rows = await db
      .select({
        id: orders.id,
        code: sql<string>`'INV' || to_char(${orders.created_at}, 'IYYY') || lpad(${orders.sequence_number}::text, 4, '0')`,
        amount: orders.amount,
        currency: orders.currency,
        status: orders.status,
        created_at: orders.created_at,
        workspaceName: workspaces.name,
        userName: users.name,
        userEmail: users.email,
        xendit_payment_id: orders.xendit_payment_id,
        xendit_invoice_id: orders.xendit_invoice_id,
        xendit_subscription_id: orders.xendit_subscription_id,
      })
      .from(orders)
      .leftJoin(workspaces, eq(orders.workspace_id, workspaces.id))
      .leftJoin(users, eq(orders.user_id, users.id))
      .where(whereClause)
      .orderBy(desc(orders.created_at))
      .limit(limit)
      .offset(offset);

    return { rows, total: Number(totalResult?.count ?? 0) };
  }

  static async findById(id: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), isNull(orders.deleted_at)))
      .limit(1);
    return order ?? null;
  }

  static async findByInvoiceId(invoiceId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.xendit_invoice_id, invoiceId),
          isNull(orders.deleted_at)
        )
      )
      .limit(1);
    return order ?? null;
  }
  static async findByWorkspaceId(workspaceId: string) {
    return await db
      .select({
        id: orders.id,
        code: sql<string>`'INV' || to_char(${orders.created_at}, 'IYYY') || lpad(${orders.sequence_number}::text, 4, '0')`,
        workspace_id: orders.workspace_id,
        user_id: orders.user_id,
        xendit_payment_id: orders.xendit_payment_id,
        xendit_invoice_id: orders.xendit_invoice_id,
        xendit_subscription_id: orders.xendit_subscription_id,
        amount: orders.amount,
        currency: orders.currency,
        status: orders.status,
        created_at: orders.created_at,
        updated_at: orders.updated_at,
      })
      .from(orders)
      .where(and(eq(orders.workspace_id, workspaceId), isNull(orders.deleted_at)))
      .orderBy(desc(orders.created_at));
  }
}
