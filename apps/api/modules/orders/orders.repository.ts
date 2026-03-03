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
  sql,
} from "@workspace/database";

/**
 * Orders repository — ONLY layer with DB access.
 */
export const ordersRepository = {
  async create(data: typeof orders.$inferInsert) {
    const [order] = await db.insert(orders).values(data).returning();
    return order;
  },

  async updateByStripeInvoiceId(
    invoiceId: string,
    data: Partial<typeof orders.$inferInsert>,
  ) {
    const [order] = await db
      .update(orders)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orders.stripe_invoice_id, invoiceId))
      .returning();
    return order;
  },

  async updateByPaymentIntentId(
    paymentIntentId: string,
    data: Partial<typeof orders.$inferInsert>,
  ) {
    const [order] = await db
      .update(orders)
      .set({ ...data, updated_at: new Date() })
      .where(eq(orders.stripe_payment_intent_id, paymentIntentId))
      .returning();
    return order;
  },

  async findAll(page = 1, limit = 20, search?: string) {
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
      })
      .from(orders)
      .leftJoin(workspaces, eq(orders.workspace_id, workspaces.id))
      .leftJoin(users, eq(orders.user_id, users.id))
      .where(whereClause)
      .orderBy(desc(orders.created_at))
      .limit(limit)
      .offset(offset);

    return { rows, total: Number(totalResult?.count ?? 0) };
  },

  async findById(id: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return order ?? null;
  },

  async findByInvoiceId(invoiceId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.stripe_invoice_id, invoiceId))
      .limit(1);
    return order ?? null;
  },
};
