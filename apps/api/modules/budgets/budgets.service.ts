import type { CreateBudgetInput, UpdateBudgetInput } from "@workspace/types";
import { ErrorCode } from "@workspace/types";
import { buildApiResponse } from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CategoriesRepository } from "../categories/categories.repository";
import { NotificationsService } from "../notifications/notifications.service";
import { BudgetsRepository } from "./budgets.repository";

const BUDGET_STATUS_TTL = 60 * 30; // 30 min
const budgetStatusKey = (workspaceId: string, year: number, month: number) =>
  `oewang:budgets:status:${workspaceId}:${year}:${month}`;

export abstract class BudgetsService {
  static async create(
    data: CreateBudgetInput,
    workspaceId: string,
    userId: string,
  ) {
    // Check if budget for this category already exists
    const existing = await BudgetsRepository.findByCategory(
      data.categoryId,
      workspaceId,
    );
    if (existing) {
      return buildApiResponse({
        success: false,
        code: ErrorCode.CONFLICT,
        message: "Budget for this category already exists",
        status: 409,
      });
    }

    // Verify category exists and belongs to workspace
    const category = await CategoriesRepository.findById(
      workspaceId,
      data.categoryId,
    );
    if (!category || category.type !== "expense") {
      return buildApiResponse({
        success: false,
        code: ErrorCode.NOT_FOUND,
        message: "Expense category not found",
        status: 404,
      });
    }

    const budget = await BudgetsRepository.create({
      ...data,
      amount: String(data.amount),
      workspaceId,
    });

    if (!budget) {
      return buildApiResponse({
        success: false,
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to create budget",
        status: 500,
      });
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "budget.created",
      entity: "budget",
      entity_id: budget.id,
      after: budget,
    });

    const now = new Date();
    await cacheDel(
      budgetStatusKey(workspaceId, now.getFullYear(), now.getMonth() + 1),
    );

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "budget.created",
      title: "Budget Created",
      message: `A budget of ${budget.amount} has been set for ${category.name}.`,
      link: "/budget",
    }).catch(() => {});

    return buildApiResponse({
      success: true,
      data: budget,
      status: 201,
    });
  }

  static async update(
    id: string,
    data: UpdateBudgetInput,
    workspaceId: string,
    userId: string,
  ) {
    const before = await BudgetsRepository.findById(id, workspaceId);
    if (!before) {
      return buildApiResponse({
        success: false,
        code: ErrorCode.NOT_FOUND,
        message: "Budget not found",
        status: 404,
      });
    }

    const budget = await BudgetsRepository.update(id, workspaceId, {
      amount: data.amount !== undefined ? String(data.amount) : undefined,
    });

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "budget.updated",
      entity: "budget",
      entity_id: id,
      before,
      after: budget,
    });

    const now = new Date();
    await cacheDel(
      budgetStatusKey(workspaceId, now.getFullYear(), now.getMonth() + 1),
    );

    return buildApiResponse({
      success: true,
      data: budget,
    });
  }

  static async delete(id: string, workspaceId: string, userId: string) {
    const before = await BudgetsRepository.findById(id, workspaceId);
    if (!before) {
      return buildApiResponse({
        success: false,
        code: ErrorCode.NOT_FOUND,
        message: "Budget not found",
        status: 404,
      });
    }

    await BudgetsRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "budget.deleted",
      entity: "budget",
      entity_id: id,
      before,
    });

    const now = new Date();
    await cacheDel(
      budgetStatusKey(workspaceId, now.getFullYear(), now.getMonth() + 1),
    );

    return buildApiResponse({
      success: true,
      message: "Budget deleted successfully",
    });
  }

  static async invalidateCurrentMonthCache(workspaceId: string) {
    const now = new Date();
    await cacheDel(
      budgetStatusKey(workspaceId, now.getFullYear(), now.getMonth() + 1),
    );
  }

  static async getStatus(workspaceId: string, month?: number, year?: number) {
    const now = new Date();
    const targetMonth = month !== undefined ? month - 1 : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();
    const cacheMonth = month !== undefined ? month : now.getMonth() + 1;
    const cacheYear = year !== undefined ? year : now.getFullYear();

    const key = budgetStatusKey(workspaceId, cacheYear, cacheMonth);
    const cached = await cacheGet<object[]>(key);
    if (cached) return buildApiResponse({ success: true, data: cached });

    const startDate = new Date(targetYear, targetMonth, 1).toISOString();
    const endDate = new Date(
      targetYear,
      targetMonth + 1,
      0,
      23,
      59,
      59,
    ).toISOString();

    const budgetStatus = await BudgetsRepository.getStatus(
      workspaceId,
      startDate,
      endDate,
    );

    await cacheSet(key, budgetStatus, BUDGET_STATUS_TTL);

    return buildApiResponse({
      success: true,
      data: budgetStatus,
    });
  }
}
