import { BudgetsRepository } from "./budgets.repository";
import { CategoriesRepository } from "../categories/categories.repository";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { buildApiResponse } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import type { CreateBudgetInput, UpdateBudgetInput } from "@workspace/types";

export abstract class BudgetsService {
  static async create(data: CreateBudgetInput, workspaceId: string, userId: string) {
    // Check if budget for this category already exists
    const existing = await BudgetsRepository.findByCategory(data.categoryId, workspaceId);
    if (existing) {
      return buildApiResponse({
        success: false,
        code: ErrorCode.CONFLICT,
        message: "Budget for this category already exists",
        status: 409,
      });
    }

    // Verify category exists and belongs to workspace
    const category = await CategoriesRepository.findById(workspaceId, data.categoryId);
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

    return buildApiResponse({
      success: true,
      data: budget,
      status: 201,
    });
  }

  static async update(id: string, data: UpdateBudgetInput, workspaceId: string, userId: string) {
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

    return buildApiResponse({
      success: true,
      message: "Budget deleted successfully",
    });
  }

  static async getStatus(workspaceId: string, month?: number, year?: number) {
    const now = new Date();
    const targetMonth = month !== undefined ? month - 1 : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();

    const startDate = new Date(targetYear, targetMonth, 1).toISOString();
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59).toISOString();

    const status = await BudgetsRepository.getStatus(workspaceId, startDate, endDate);

    return buildApiResponse({
      success: true,
      data: status,
    });
  }
}
