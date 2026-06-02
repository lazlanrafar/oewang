import { db, workspaceSubCurrencies } from "@workspace/database";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { CreateSubCurrencyInput } from "./sub-currencies.model";

type WorkspaceSubCurrency = typeof workspaceSubCurrencies.$inferSelect;

export abstract class SubCurrenciesRepository {
  static async findByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceSubCurrency[]> {
    return db
      .select()
      .from(workspaceSubCurrencies)
      .where(
        and(
          eq(workspaceSubCurrencies.workspaceId, workspaceId),
          isNull(workspaceSubCurrencies.deletedAt),
        ),
      );
  }

  static async findById(
    id: string,
    workspaceId: string,
  ): Promise<WorkspaceSubCurrency | null> {
    const [subCurrency] = await db
      .select()
      .from(workspaceSubCurrencies)
      .where(
        and(
          eq(workspaceSubCurrencies.id, id),
          eq(workspaceSubCurrencies.workspaceId, workspaceId),
          isNull(workspaceSubCurrencies.deletedAt),
        ),
      )
      .limit(1);

    return subCurrency || null;
  }

  static async findByCurrencyCode(
    workspaceId: string,
    currencyCode: string,
  ): Promise<WorkspaceSubCurrency | null> {
    const [subCurrency] = await db
      .select()
      .from(workspaceSubCurrencies)
      .where(
        and(
          eq(workspaceSubCurrencies.workspaceId, workspaceId),
          eq(workspaceSubCurrencies.currencyCode, currencyCode),
          isNull(workspaceSubCurrencies.deletedAt),
        ),
      )
      .limit(1);

    return subCurrency || null;
  }

  static async create(
    workspaceId: string,
    data: CreateSubCurrencyInput,
  ): Promise<WorkspaceSubCurrency> {
    const [subCurrency] = await db
      .insert(workspaceSubCurrencies)
      .values({
        workspaceId,
        currencyCode: data.currencyCode,
      })
      .returning();

    return subCurrency as WorkspaceSubCurrency;
  }

  static async delete(
    id: string,
    workspaceId: string,
  ): Promise<WorkspaceSubCurrency | null> {
    const [subCurrency] = await db
      .update(workspaceSubCurrencies)
      .set({
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(workspaceSubCurrencies.id, id),
          eq(workspaceSubCurrencies.workspaceId, workspaceId),
          isNull(workspaceSubCurrencies.deletedAt),
        ),
      )
      .returning();

    return subCurrency || null;
  }
}
