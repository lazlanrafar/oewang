import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { RealtimeService } from "../realtime/realtime.service";
import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from "./categories.model";
import { CategoriesRepository } from "./categories.repository";

const CATEGORIES_TTL = 60 * 60 * 24; // 24h

function categoryKeys(workspaceId: string): string[] {
  return [
    `oewang:categories:${workspaceId}:all`,
    `oewang:categories:${workspaceId}:income`,
    `oewang:categories:${workspaceId}:expense`,
  ];
}

function categoryKey(workspaceId: string, type?: "income" | "expense"): string {
  return `oewang:categories:${workspaceId}:${type ?? "all"}`;
}

export abstract class CategoriesService {
  static async createCategory(
    workspaceId: string,
    userId: string,
    data: CreateCategoryInput,
  ) {
    const category = await CategoriesRepository.create({
      workspaceId,
      name: data.name,
      type: data.type,
    });

    if (!category) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to create category"),
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "category.created",
      entity: "category",
      entity_id: category.id,
      after: category,
    });

    await cacheDel(...categoryKeys(workspaceId));
    RealtimeService.notifyValueChange(workspaceId, "categories");

    return buildSuccess(category, "Category created successfully", "CREATED");
  }

  static async updateCategory(
    workspaceId: string,
    userId: string,
    id: string,
    data: UpdateCategoryInput,
  ) {
    const category = await CategoriesRepository.findById(workspaceId, id);
    if (!category) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Category not found"));
    }

    const updated = await CategoriesRepository.update(id, workspaceId, data);

    if (!updated) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to update category"),
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "category.updated",
      entity: "category",
      entity_id: id,
      before: category,
      after: updated,
    });

    await cacheDel(...categoryKeys(workspaceId));
    RealtimeService.notifyValueChange(workspaceId, "categories");

    return buildSuccess(updated, "Category updated successfully");
  }

  static async reorderCategories(
    workspaceId: string,
    userId: string,
    data: ReorderCategoriesInput,
  ) {
    await CategoriesRepository.reorder(workspaceId, data.updates);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "categories.reordered",
      entity: "category",
      entity_id: "00000000-0000-0000-0000-000000000000",
      after: data.updates,
    });

    await cacheDel(...categoryKeys(workspaceId));
    RealtimeService.notifyValueChange(workspaceId, "categories");

    return buildSuccess(null, "Categories reordered successfully");
  }

  static async deleteCategory(workspaceId: string, userId: string, id: string) {
    const category = await CategoriesRepository.findById(workspaceId, id);
    if (!category) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Category not found"));
    }

    await CategoriesRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "category.deleted",
      entity: "category",
      entity_id: id,
      before: category,
    });

    await cacheDel(...categoryKeys(workspaceId));
    RealtimeService.notifyValueChange(workspaceId, "categories");

    return buildSuccess(null, "Category deleted successfully");
  }

  static async getCategories(workspaceId: string, type?: "income" | "expense") {
    const key = categoryKey(workspaceId, type);
    const cached =
      await cacheGet<
        ReturnType<typeof CategoriesRepository.findMany> extends Promise<
          infer T
        >
          ? T
          : never
      >(key);
    if (cached)
      return buildSuccess(cached, "Categories retrieved successfully");

    const categories = await CategoriesRepository.findMany(workspaceId, type);
    await cacheSet(key, categories, CATEGORIES_TTL);
    return buildSuccess(categories, "Categories retrieved successfully");
  }
}
