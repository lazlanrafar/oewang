import { createId } from "@paralleldrive/cuid2";
import { BucketClient } from "@workspace/bucket";
import { Env } from "@workspace/constants";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type {
  ArticleListInput,
  CreateArticleInput,
  UpdateArticleInput,
} from "./articles.dto";
import { ArticlesRepository } from "./articles.repository";
import { slugify } from "./articles.utils";

const ARTICLES_PUBLIC_LIST_KEY = "oewang:articles:public:list";
const ARTICLES_PUBLIC_ITEM_PREFIX = "oewang:articles:public:item:";
const ARTICLES_PUBLIC_TTL = 60 * 60; // 1h

// Global marketing content — not workspace-scoped. Admin mutations are audited
// under the acting admin's own workspace context (mirrors PricingService).
export abstract class ArticlesService {
  static async getAll(query: ArticleListInput) {
    const { rows, total } = await ArticlesRepository.findAll(query);
    const limit = query.limit || 50;
    const page = query.page || 1;

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async getStats() {
    const stats = await ArticlesRepository.getStats();
    return buildSuccess(stats);
  }

  static async getById(id: string) {
    const article = await ArticlesRepository.findById(id);
    if (!article) {
      return buildError(ErrorCode.NOT_FOUND, "Article not found");
    }

    return buildSuccess(article);
  }

  // Slugify the requested/derived slug, then append a short suffix on collision
  // so public URLs stay unique without a retry loop.
  private static async resolveSlug(raw: string): Promise<string> {
    const base = slugify(raw);
    if (!(await ArticlesRepository.slugExists(base))) return base;
    return `${base}-${Math.random().toString(36).substring(2, 6)}`;
  }

  private static async invalidatePublic(slug?: string | null) {
    await cacheDel(ARTICLES_PUBLIC_LIST_KEY);
    if (slug) await cacheDel(`${ARTICLES_PUBLIC_ITEM_PREFIX}${slug}`);
  }

  static async create(
    dto: CreateArticleInput,
    userId: string,
    workspaceId: string,
  ) {
    const slug = await ArticlesService.resolveSlug(dto.slug || dto.title);

    const article = await ArticlesRepository.create({
      title: dto.title,
      slug,
      excerpt: dto.excerpt,
      content: dto.content,
      cover_image: dto.cover_image,
      published: dto.published ?? false,
      published_at: dto.published ? new Date() : null,
      author_id: userId,
    });

    if (!article) {
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to create article");
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "article.created",
      entity: "article",
      entity_id: article.id,
      after: article,
    });

    await ArticlesService.invalidatePublic(article.slug);

    return buildSuccess(article, "Article created successfully", "CREATED");
  }

  static async update(
    id: string,
    dto: UpdateArticleInput,
    userId: string,
    workspaceId: string,
  ) {
    const existing = await ArticlesRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Article not found");
    }

    const patch: UpdateArticleInput & { published_at?: Date | null } = {
      ...dto,
    };

    // Re-slugify only when a new slug is explicitly supplied.
    if (dto.slug !== undefined) {
      patch.slug = await ArticlesService.resolveSlug(dto.slug);
    }

    // Stamp published_at the first time it goes live; clear it when unpublished.
    if (dto.published === true && !existing.published_at) {
      patch.published_at = new Date();
    } else if (dto.published === false) {
      patch.published_at = null;
    }

    const updated = await ArticlesRepository.update(id, patch);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "article.updated",
      entity: "article",
      entity_id: id,
      before: existing,
      after: updated,
    });

    await ArticlesService.invalidatePublic(existing.slug);
    if (updated?.slug && updated.slug !== existing.slug) {
      await ArticlesService.invalidatePublic(updated.slug);
    }

    return buildSuccess(updated);
  }

  static async softDelete(id: string, userId: string, workspaceId: string) {
    const existing = await ArticlesRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Article not found");
    }

    await ArticlesRepository.softDelete(id);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "article.deleted",
      entity: "article",
      entity_id: id,
      before: existing,
    });

    await ArticlesService.invalidatePublic(existing.slug);

    return buildSuccess(null);
  }

  // Upload an inline/cover image to the system bucket under a public prefix and
  // return a PERMANENT public URL (unlike vault which returns 1h signed URLs).
  // The `articles/` prefix must allow anonymous GET on the target bucket.
  static async uploadImage(file: {
    name: string;
    type: string;
    buffer: Buffer;
  }) {
    const endpoint = Env.BUCKET_ENDPOINT;
    const bucketName = Env.BUCKET_NAME;
    if (!endpoint || !Env.BUCKET_ACCESS_KEY_ID || !bucketName) {
      return buildError(
        ErrorCode.INTERNAL_ERROR,
        "Image storage is not configured",
      );
    }

    const bucket = new BucketClient({
      endpoint,
      accessKeyId: Env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: Env.BUCKET_SECRET_ACCESS_KEY ?? "",
      bucketName,
      region: Env.BUCKET_REGION,
    });

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const key = `articles/${createId()}.${ext}`;
    await bucket.upload(key, file.buffer, file.type);

    const base = Env.BUCKET_PUBLIC_URL
      ? Env.BUCKET_PUBLIC_URL.replace(/\/$/, "")
      : `${endpoint.replace(/\/$/, "")}/${bucketName}`;

    return buildSuccess({ url: `${base}/${key}` }, "Image uploaded");
  }

  static async getPublicList() {
    const cached = await cacheGet<object[]>(ARTICLES_PUBLIC_LIST_KEY);
    if (cached) return buildSuccess(cached, "Articles retrieved");

    const rows = await ArticlesRepository.findPublicList();
    await cacheSet(ARTICLES_PUBLIC_LIST_KEY, rows, ARTICLES_PUBLIC_TTL);

    return buildSuccess(rows, "Articles retrieved");
  }

  static async getPublicBySlug(slug: string) {
    const key = `${ARTICLES_PUBLIC_ITEM_PREFIX}${slug}`;
    const cached = await cacheGet<object>(key);
    if (cached) return buildSuccess(cached, "Article retrieved");

    const article = await ArticlesRepository.findPublicBySlug(slug);
    if (!article) {
      return buildError(ErrorCode.NOT_FOUND, "Article not found");
    }

    await cacheSet(key, article, ARTICLES_PUBLIC_TTL);

    return buildSuccess(article, "Article retrieved");
  }
}
