import { db, pricing } from "@workspace/database";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type {
  CreatePricingInput,
  PricingListInput,
  UpdatePricingInput,
} from "./pricing.dto";

export abstract class PricingRepository {
  static async findAll(query: PricingListInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: (SQL<unknown> | undefined)[] = [
      isNull(pricing.deleted_at),
    ];

    if (query.search) {
      conditions.push(
        or(
          ilike(pricing.name, `%${query.search}%`),
          ilike(pricing.description, `%${query.search}%`),
        ),
      );
    }

    if (query.is_active !== undefined) {
      conditions.push(eq(pricing.is_active, query.is_active));
    }

    if (query.is_addon !== undefined) {
      conditions.push(eq(pricing.is_addon, query.is_addon));
    }

    let orderByClause = asc(pricing.created_at);
    if (query.sortBy === "name") {
      orderByClause =
        query.sortOrder === "desc" ? desc(pricing.name) : asc(pricing.name);
    } else if (query.sortBy === "created_at") {
      orderByClause =
        query.sortOrder === "desc"
          ? desc(pricing.created_at)
          : asc(pricing.created_at);
    }

    const [data, totalCount] = await Promise.all([
      db
        .select()
        .from(pricing)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(pricing)
        .where(and(...conditions)),
    ]);

    return {
      rows: data,
      total: Number(totalCount[0]?.count || 0),
    };
  }

  static async findById(id: string) {
    const result = await db
      .select()
      .from(pricing)
      .where(and(eq(pricing.id, id), isNull(pricing.deleted_at)))
      .limit(1);

    return result[0] || null;
  }

  static async create(dto: CreatePricingInput) {
    const [result] = await db
      .insert(pricing)
      .values({
        name: dto.name,
        description: dto.description,
        prices: dto.prices || [],
        max_vault_size_mb: dto.max_vault_size_mb || 100,
        max_ai_tokens: dto.max_ai_tokens || 100,
        max_workspaces: dto.max_workspaces || 1,
        features: dto.features || [],
        is_active: dto.is_active ?? true,
        is_addon: dto.is_addon ?? false,
        addon_type: dto.addon_type,
      })
      .returning();

    return result;
  }

  static async update(id: string, dto: UpdatePricingInput) {
    const [result] = await db
      .update(pricing)
      .set({
        ...dto,
        updated_at: new Date(),
      })
      .where(and(eq(pricing.id, id), isNull(pricing.deleted_at)))
      .returning();

    return result;
  }

  static async softDelete(id: string) {
    const [result] = await db
      .update(pricing)
      .set({ deleted_at: new Date() })
      .where(and(eq(pricing.id, id), isNull(pricing.deleted_at)))
      .returning();

    return result;
  }

  static async getStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${pricing.is_active} = true)`,
        inactive: sql<number>`count(*) filter (where ${pricing.is_active} = false)`,
        addons: sql<number>`count(*) filter (where ${pricing.is_addon} = true)`,
      })
      .from(pricing)
      .where(isNull(pricing.deleted_at));

    return {
      total: Number(row?.total ?? 0),
      active: Number(row?.active ?? 0),
      inactive: Number(row?.inactive ?? 0),
      addons: Number(row?.addons ?? 0),
    };
  }

  static async findPublicActive() {
    return db
      .select()
      .from(pricing)
      .where(and(eq(pricing.is_active, true), isNull(pricing.deleted_at)))
      .orderBy(asc(pricing.created_at));
  }
}
