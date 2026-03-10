import { db, customers } from "@workspace/database";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { CreateCustomerInput, UpdateCustomerInput } from "./customers.dto";

export abstract class CustomersRepository {
  static async findAll(
    workspaceId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
  ) {
    const filters = [
      eq(customers.workspaceId, workspaceId),
      isNull(customers.deletedAt),
    ];

    if (search) {
      filters.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
        ) as any,
      );
    }

    const rows = await db
      .select()
      .from(customers)
      .where(and(...filters))
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return rows;
  }

  static async count(workspaceId: string, search?: string): Promise<number> {
    const filters = [
      eq(customers.workspaceId, workspaceId),
      isNull(customers.deletedAt),
    ];

    if (search) {
      filters.push(
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.email, `%${search}%`),
        ) as any,
      );
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(...filters));

    return Number(result?.count ?? 0);
  }

  static async findById(id: string, workspaceId: string) {
    const [row] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.workspaceId, workspaceId),
          isNull(customers.deletedAt),
        ),
      );
    return row ?? null;
  }

  static async create(data: CreateCustomerInput & { workspaceId: string }) {
    const [row] = await db.insert(customers).values(data).returning();
    return row!;
  }

  static async update(
    id: string,
    workspaceId: string,
    data: Partial<UpdateCustomerInput>,
  ) {
    const [row] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.workspaceId, workspaceId),
          isNull(customers.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  static async softDelete(id: string, workspaceId: string) {
    await db
      .update(customers)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.workspaceId, workspaceId),
          isNull(customers.deletedAt),
        ),
      );
  }
}
