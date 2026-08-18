import { articles, db } from "@workspace/database";
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
  ArticleListInput,
  CreateArticleInput,
  UpdateArticleInput,
} from "./articles.dto";

type ArticleInsert = Omit<CreateArticleInput, "slug"> & {
  slug: string;
  author_id?: string | null;
  published_at?: Date | null;
};

export abstract class ArticlesRepository {
  static async findAll(query: ArticleListInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const conditions: (SQL<unknown> | undefined)[] = [
      isNull(articles.deleted_at),
    ];

    if (query.search) {
      conditions.push(
        or(
          ilike(articles.title, `%${query.search}%`),
          ilike(articles.excerpt, `%${query.search}%`),
        ),
      );
    }

    if (query.published !== undefined) {
      conditions.push(eq(articles.published, query.published));
    }

    let orderByClause = desc(articles.created_at);
    if (query.sortBy === "title") {
      orderByClause =
        query.sortOrder === "asc" ? asc(articles.title) : desc(articles.title);
    } else if (query.sortBy === "created_at") {
      orderByClause =
        query.sortOrder === "asc"
          ? asc(articles.created_at)
          : desc(articles.created_at);
    }

    const [data, totalCount] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
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
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deleted_at)))
      .limit(1);

    return result[0] || null;
  }

  static async slugExists(slug: string) {
    const result = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    return result.length > 0;
  }

  static async create(values: ArticleInsert) {
    const [result] = await db.insert(articles).values(values).returning();
    return result;
  }

  static async update(
    id: string,
    dto: UpdateArticleInput & { published_at?: Date | null },
  ) {
    const [result] = await db
      .update(articles)
      .set({ ...dto, updated_at: new Date() })
      .where(and(eq(articles.id, id), isNull(articles.deleted_at)))
      .returning();

    return result;
  }

  static async softDelete(id: string) {
    const [result] = await db
      .update(articles)
      .set({ deleted_at: new Date() })
      .where(and(eq(articles.id, id), isNull(articles.deleted_at)))
      .returning();

    return result;
  }

  static async getStats() {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`count(*) filter (where ${articles.published} = true)`,
        draft: sql<number>`count(*) filter (where ${articles.published} = false)`,
      })
      .from(articles)
      .where(isNull(articles.deleted_at));

    return {
      total: Number(row?.total ?? 0),
      published: Number(row?.published ?? 0),
      draft: Number(row?.draft ?? 0),
    };
  }

  // Public: published list without the full body (excerpt only for cards).
  static async findPublicList() {
    return db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        cover_image: articles.cover_image,
        published_at: articles.published_at,
        created_at: articles.created_at,
      })
      .from(articles)
      .where(and(eq(articles.published, true), isNull(articles.deleted_at)))
      .orderBy(desc(articles.published_at), desc(articles.created_at));
  }

  static async findPublicBySlug(slug: string) {
    const result = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.slug, slug),
          eq(articles.published, true),
          isNull(articles.deleted_at),
        ),
      )
      .limit(1);

    return result[0] || null;
  }
}
