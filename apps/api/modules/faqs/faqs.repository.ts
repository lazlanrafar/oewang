import { db, faqs } from "@workspace/database";
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
import type { CreateFaqInput, FaqListInput, UpdateFaqInput } from "./faqs.dto";

export abstract class FaqsRepository {
  static async findAll(query: FaqListInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: (SQL<unknown> | undefined)[] = [isNull(faqs.deleted_at)];

    if (query.search) {
      conditions.push(
        or(
          ilike(faqs.question, `%${query.search}%`),
          ilike(faqs.answer, `%${query.search}%`),
        ),
      );
    }

    if (query.published !== undefined) {
      conditions.push(eq(faqs.published, query.published));
    }

    let orderByClause: SQL<unknown> = asc(faqs.sort_order);
    if (query.sortBy === "created_at") {
      orderByClause =
        query.sortOrder === "desc"
          ? desc(faqs.created_at)
          : asc(faqs.created_at);
    }

    const [data, totalCount] = await Promise.all([
      db
        .select()
        .from(faqs)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(faqs)
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
      .from(faqs)
      .where(and(eq(faqs.id, id), isNull(faqs.deleted_at)))
      .limit(1);

    return result[0] || null;
  }

  static async create(dto: CreateFaqInput) {
    const [result] = await db
      .insert(faqs)
      .values({
        question: dto.question,
        answer: dto.answer,
        category: dto.category,
        sort_order: dto.sort_order ?? 0,
        published: dto.published ?? true,
      })
      .returning();

    return result;
  }

  static async update(id: string, dto: UpdateFaqInput) {
    const [result] = await db
      .update(faqs)
      .set({ ...dto, updated_at: new Date() })
      .where(and(eq(faqs.id, id), isNull(faqs.deleted_at)))
      .returning();

    return result;
  }

  static async softDelete(id: string) {
    const [result] = await db
      .update(faqs)
      .set({ deleted_at: new Date() })
      .where(and(eq(faqs.id, id), isNull(faqs.deleted_at)))
      .returning();

    return result;
  }

  static async getStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`count(*) filter (where ${faqs.published} = true)`,
        draft: sql<number>`count(*) filter (where ${faqs.published} = false)`,
      })
      .from(faqs)
      .where(isNull(faqs.deleted_at));

    return {
      total: Number(row?.total ?? 0),
      published: Number(row?.published ?? 0),
      draft: Number(row?.draft ?? 0),
    };
  }

  static async findPublicPublished() {
    return db
      .select({
        id: faqs.id,
        question: faqs.question,
        answer: faqs.answer,
        category: faqs.category,
      })
      .from(faqs)
      .where(and(eq(faqs.published, true), isNull(faqs.deleted_at)))
      .orderBy(asc(faqs.sort_order));
  }
}
