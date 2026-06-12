import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { SystemAdminsRepository } from "./system-admins.repository";

const log = createLogger("system-admins");

export abstract class SystemAdminsService {
  static async getAllUsers(params: {
    page: number;
    limit: number;
    search?: string;
    system_role?: string;
    start?: string;
    end?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    try {
      const { rows, total } = await SystemAdminsRepository.findAll(params);

      // system_role is stored natively in the users table.

      return buildPaginatedSuccess(
        rows,
        buildPagination(total, params.page, params.limit),
      );
    } catch (error: any) {
      log.error("Failed to fetch users", { error });
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to fetch users");
    }
  }

  static async updateSystemRole(
    targetUserId: string,
    newRole: import("@workspace/constants").SystemRole,
  ) {
    // 1. Fetch user from database
    const dbUser = await SystemAdminsRepository.findUserEmail(targetUserId);

    if (!dbUser) {
      return buildError(ErrorCode.NOT_FOUND, "User not found in database.");
    }

    // 2. Prevent demoting the root owner
    if (
      dbUser.email === "lazlanrafar@gmail.com" &&
      newRole !== "superadmin" &&
      newRole !== "owner"
    ) {
      return buildError(ErrorCode.FORBIDDEN, "Cannot demote the root owner.");
    }

    await SystemAdminsRepository.updateSystemRole(targetUserId, newRole);

    return buildSuccess(undefined);
  }

  static async getAllWorkspaces(params: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    try {
      const { rows, total } =
        await SystemAdminsRepository.findAllWorkspaces(params);
      return buildPaginatedSuccess(
        rows,
        buildPagination(total, params.page, params.limit),
      );
    } catch (error: any) {
      log.error("Failed to fetch workspaces", { error });
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to fetch workspaces");
    }
  }

  static async changeWorkspacePlan(workspaceId: string, planId: string) {
    try {
      const updated = await SystemAdminsRepository.updateWorkspacePlan(
        workspaceId,
        planId,
      );
      return buildSuccess(updated, "Workspace plan updated successfully");
    } catch (error: any) {
      log.error("Failed to update workspace plan", { error });
      return buildError(
        ErrorCode.VALIDATION_ERROR,
        error.message || "Failed to update workspace plan",
      );
    }
  }

  static async getUserStats(params: { start?: string; end?: string }) {
    try {
      const stats = await SystemAdminsRepository.getUserStats(params);
      return buildSuccess(stats);
    } catch (error: any) {
      log.error("Failed to fetch user stats", { error });
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to fetch user stats");
    }
  }

  static async getWorkspaceStats() {
    try {
      const stats = await SystemAdminsRepository.getWorkspaceStats();
      return buildSuccess(stats);
    } catch (error: any) {
      log.error("Failed to fetch workspace stats", { error });
      return buildError(
        ErrorCode.INTERNAL_ERROR,
        "Failed to fetch workspace stats",
      );
    }
  }

  static async getAllPlans() {
    try {
      const plans = await SystemAdminsRepository.findAllPlans();
      return buildSuccess(plans);
    } catch (error: any) {
      log.error("Failed to fetch plans", { error });
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to fetch plans");
    }
  }
}
