import {
  and,
  contacts,
  db,
  debtPayments,
  debts,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  transactions,
} from "@workspace/database";
import type { Debt, DebtPayment } from "@workspace/types";

export abstract class DebtsRepository {
  static async create(
    data: {
      workspaceId: string;
      contactId: string;
      type: "payable" | "receivable";
      amount: string | number;
      remainingAmount: string | number;
      origin?: "manual" | "from_transaction";
      sourceTransactionId?: string;
      description?: string;
      dueDate?: string;
    },
    tx: any = db,
  ): Promise<Debt | null> {
    const [debt] = await tx
      .insert(debts)
      .values({
        workspaceId: data.workspaceId,
        contactId: data.contactId,
        type: data.type,
        amount: data.amount.toString(),
        remainingAmount: data.remainingAmount.toString(),
        origin: data.origin ?? "manual",
        sourceTransactionId: data.sourceTransactionId,
        description: data.description,
        dueDate: data.dueDate,
      })
      .returning();
    return debt
      ? ({
          ...debt,
          createdAt: debt.createdAt,
          updatedAt: debt.updatedAt,
          deletedAt: debt.deletedAt,
        } as unknown as Debt)
      : null;
  }

  static async update(
    id: string,
    workspaceId: string,
    data: Partial<{
      amount: string | number;
      remainingAmount: string | number;
      status: string;
      description: string;
      dueDate: string;
    }>,
    tx: any = db,
  ): Promise<Debt | null> {
    const updateData: any = { ...data, updatedAt: sql`now()` };
    if (data.amount !== undefined) updateData.amount = data.amount.toString();
    if (data.remainingAmount !== undefined)
      updateData.remainingAmount = data.remainingAmount.toString();

    const [debt] = await tx
      .update(debts)
      .set(updateData)
      .where(
        and(
          eq(debts.id, id),
          eq(debts.workspaceId, workspaceId),
          isNull(debts.deletedAt),
        ),
      )
      .returning();
    return debt
      ? ({
          ...debt,
          createdAt: debt.createdAt,
          updatedAt: debt.updatedAt,
          deletedAt: debt.deletedAt,
        } as unknown as Debt)
      : null;
  }

  static async delete(id: string, workspaceId: string): Promise<Debt | null> {
    const [debt] = await db
      .update(debts)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(debts.id, id),
          eq(debts.workspaceId, workspaceId),
          isNull(debts.deletedAt),
        ),
      )
      .returning();
    return debt as unknown as Debt;
  }

  static async findMany(
    workspaceId: string,
    filters?: {
      contactId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<{ rows: any[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(debts.workspaceId, workspaceId),
      isNull(debts.deletedAt),
    ];

    if (filters?.contactId) {
      conditions.push(eq(debts.contactId, filters.contactId));
    }

    if (filters?.search) {
      conditions.push(ilike(contacts.name, `%${filters.search}%`));
    }

    if (filters?.startDate && filters?.endDate) {
      conditions.push(
        or(
          and(
            gte(debts.dueDate, filters.startDate),
            lte(debts.dueDate, filters.endDate),
          ),
          and(
            isNull(debts.dueDate),
            gte(debts.createdAt, filters.startDate),
            lte(debts.createdAt, filters.endDate),
          ),
        )!,
      );
    }

    const rows = await db
      .select({
        debt: debts,
        contactName: contacts.name,
      })
      .from(debts)
      .leftJoin(contacts, eq(debts.contactId, contacts.id))
      .where(and(...conditions))
      .orderBy(desc(debts.createdAt))
      .limit(limit)
      .offset(offset);

    const [stats] = await db
      .select({ total: sql<number>`count(*)` })
      .from(debts)
      .leftJoin(contacts, eq(debts.contactId, contacts.id))
      .where(and(...conditions));

    return {
      rows: rows.map((r) => ({ ...r.debt, contactName: r.contactName })),
      total: Number(stats?.total ?? 0),
    };
  }

  static async findById(workspaceId: string, id: string): Promise<Debt | null> {
    const [debt] = await db
      .select()
      .from(debts)
      .where(
        and(
          eq(debts.id, id),
          eq(debts.workspaceId, workspaceId),
          isNull(debts.deletedAt),
        ),
      )
      .limit(1);

    return debt ? (debt as unknown as Debt) : null;
  }

  static async addPayment(
    data: {
      workspaceId: string;
      debtId: string;
      transactionId?: string;
      amount: string | number;
    },
    tx: any = db,
  ): Promise<DebtPayment | null> {
    const [payment] = await tx
      .insert(debtPayments)
      .values({
        workspaceId: data.workspaceId,
        debtId: data.debtId,
        transactionId: data.transactionId,
        amount: data.amount.toString(),
        deletedAt: null,
      })
      .returning();
    return payment as unknown as DebtPayment;
  }

  static async getPayments(
    workspaceId: string,
    debtId: string,
  ): Promise<DebtPayment[]> {
    const results = await db
      .select()
      .from(debtPayments)
      .where(
        and(
          eq(debtPayments.debtId, debtId),
          eq(debtPayments.workspaceId, workspaceId),
          isNull(debtPayments.deletedAt),
        ),
      )
      .orderBy(desc(debtPayments.createdAt));
    return results as unknown as DebtPayment[];
  }
}
