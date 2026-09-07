import {
  and,
  contacts,
  db,
  desc,
  eq,
  ilike,
  invoices,
  isNull,
  sql,
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

    const rows = await db
      .select({
        invoice: invoices,
        contact: contacts,
        total: sql<number>`count(*) over()`,
      })
      .from(invoices)
      .leftJoin(contacts, eq(invoices.contactId, contacts.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(invoices.createdAt));

    return {
      data: rows.map(({ total, ...rest }) => rest),
      total: rows.length ? Number(rows[0]?.total ?? 0) : 0,
    };
  }

  static async findById(id: string, workspaceId: string) {
    const [result] = await db
      .select({
        invoice: invoices,
        contact: contacts,
      })
      .from(invoices)
      .leftJoin(contacts, eq(invoices.contactId, contacts.id))
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

  /**
   * Look up an invoice's workspace_id from its id alone, with no workspace
   * scoping — used only by the internal (Go worker) mark-overdue route,
   * whose caller only has the invoice id from its own SELECT and needs the
   * workspace_id to call the normal, workspace-scoped update path.
   */
  static async findWorkspaceIdById(id: string): Promise<string | undefined> {
    const [result] = await db
      .select({ workspaceId: invoices.workspaceId })
      .from(invoices)
      .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)))
      .limit(1);
    return result?.workspaceId;
  }

  static async findPublicById(id: string, workspaceId: string) {
    const [result] = await db
      .select({
        invoice: invoices,
        contact: contacts,
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
        },
        settings: {
          invoiceLogoUrl: workspaceSettings.invoiceLogoUrl,
        },
      })
      .from(invoices)
      .leftJoin(contacts, eq(invoices.contactId, contacts.id))
      .leftJoin(workspaces, eq(invoices.workspaceId, workspaces.id))
      .leftJoin(
        workspaceSettings,
        eq(invoices.workspaceId, workspaceSettings.workspaceId),
      )
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
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.workspaceId, workspaceId),
          isNull(invoices.deletedAt),
        ),
      )
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
