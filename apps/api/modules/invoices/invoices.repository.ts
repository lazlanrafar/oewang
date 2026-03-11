import {
  db,
  invoices,
  customers,
  and,
  eq,
  ilike,
  isNull,
  sql,
  desc,
  workspaceSettings,
  workspaces,
} from "@workspace/database";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./invoices.dto";

export abstract class InvoicesRepository {
  static async findAll(
    workspaceId: string,
    page: number,
    limit: number,
    search?: string,
    status?: string,
  ) {
    const offset = (page - 1) * limit;

    const where = and(
      eq(invoices.workspaceId, workspaceId),
      isNull(invoices.deletedAt),
      search ? ilike(invoices.invoiceNumber, `%${search}%`) : undefined,
      status ? eq(invoices.status, status) : undefined,
    );

    const [data, [countResult]] = await Promise.all([
      db
        .select({
          invoice: invoices,
          customer: customers,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(invoices.createdAt)),
      db
        .select({ count: sql`count(*)` })
        .from(invoices)
        .where(where),
    ]);

    return {
      data,
      total: Number((countResult as any)?.count ?? 0),
    };
  }

  static async findById(id: string, workspaceId: string) {
    const [result] = await db
      .select({
        invoice: invoices,
        customer: customers,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.workspaceId, workspaceId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    return result;
  }

  static async findPublicById(id: string, workspaceId: string) {
    const [result] = await db
      .select({
        invoice: invoices,
        customer: customers,
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
        },
        settings: {
          invoiceLogoUrl: workspaceSettings.invoiceLogoUrl,
        },
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .leftJoin(workspaces, eq(invoices.workspaceId, workspaces.id))
      .leftJoin(workspaceSettings, eq(invoices.workspaceId, workspaceSettings.workspaceId))
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.workspaceId, workspaceId),
          isNull(invoices.deletedAt),
        ),
      )
      .limit(1);

    return result;
  }

  static async create(data: CreateInvoiceInput & { workspaceId: string }) {
    const values = {
      ...data,
      amount: data.amount.toString(),
      vat: data.vat?.toString(),
      tax: data.tax?.toString(),
    };
    const [result] = await db.insert(invoices).values(values).returning();
    return result;
  }

  static async update(
    id: string,
    workspaceId: string,
    data: UpdateInvoiceInput,
  ) {
    const values = {
      ...data,
      amount: data.amount?.toString(),
      vat: data.vat?.toString(),
      tax: data.tax?.toString(),
      updatedAt: new Date().toISOString(),
    };
    const [result] = await db
      .update(invoices)
      .set(values)
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspaceId)))
      .returning();
    return result;
  }

  static async softDelete(id: string, workspaceId: string) {
    await db
      .update(invoices)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(invoices.id, id), eq(invoices.workspaceId, workspaceId)));
  }
}
