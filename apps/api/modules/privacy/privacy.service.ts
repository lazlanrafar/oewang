import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrivacyRepository } from "./privacy.repository";

const ERASURE_CONFIRMATION_TEXT = "ERASE_MY_DATA";
type PrivacyRequestType = "access" | "export" | "restrict" | "erasure";
type PrivacyRequestStatus =
  | "received"
  | "in_progress"
  | "completed"
  | "rejected";

export abstract class PrivacyService {
  private static addDays(date: Date, days: number) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  }

  private static async createRequest(data: {
    userId: string;
    requestType: PrivacyRequestType;
    status?: PrivacyRequestStatus;
    reason?: string;
    payload?: unknown;
    result?: unknown;
    note?: string;
    reviewedBy?: string;
  }) {
    const now = new Date();
    const dueAt =
      data.status && (data.status === "completed" || data.status === "rejected")
        ? null
        : PrivacyService.addDays(now, 30);

    return PrivacyRepository.createRequest({
      user_id: data.userId,
      request_type: data.requestType,
      status: data.status ?? "received",
      reason: data.reason ?? null,
      payload: data.payload ?? null,
      result: data.result ?? null,
      note: data.note ?? null,
      reviewed_by: data.reviewedBy ?? null,
      reviewed_at: data.reviewedBy ? now : null,
      due_at: dueAt,
      completed_at: data.status === "completed" ? now : null,
      updated_at: now,
    });
  }

  private static async getActiveMemberships(userId: string) {
    return PrivacyRepository.getActiveMemberships(userId);
  }

  private static async buildSubjectData(userId: string) {
    const user = await PrivacyRepository.getUserById(userId);

    if (!user) {
      throw status(404, buildError(ErrorCode.USER_NOT_FOUND, "User not found"));
    }

    const memberships = await PrivacyService.getActiveMemberships(userId);
    const workspaceIds = memberships.map((m) => m.workspaceId);

    const [
      notificationSettings,
      userNotifications,
      userOrders,
      assignedTransactions,
      userAuditLogs,
    ] = await Promise.all([
      PrivacyRepository.getNotificationSettings(userId),
      PrivacyRepository.getNotifications(userId, 500),
      PrivacyRepository.getOrders(userId, 500),
      PrivacyRepository.getAssignedTransactions(userId, workspaceIds, 1000),
      PrivacyRepository.getAuditLogs(userId, 1000),
    ]);

    return {
      subject: user,
      memberships,
      notification_settings: notificationSettings,
      notifications: userNotifications,
      orders: userOrders,
      transactions_assigned: assignedTransactions,
      audit_logs: userAuditLogs,
    };
  }

  static async getAccessReport(userId: string) {
    const data = await PrivacyService.buildSubjectData(userId);
    await PrivacyService.createRequest({
      userId,
      requestType: "access",
      status: "completed",
      result: { generatedAt: new Date().toISOString() },
    });
    return buildSuccess(
      {
        generatedAt: new Date().toISOString(),
        reportType: "data-subject-access-report",
        data,
      },
      "Access report generated",
    );
  }

  static async exportPersonalData(userId: string) {
    const data = await PrivacyService.buildSubjectData(userId);
    await PrivacyService.createRequest({
      userId,
      requestType: "export",
      status: "completed",
      result: { generatedAt: new Date().toISOString(), format: "json" },
    });
    return buildSuccess(
      {
        generatedAt: new Date().toISOString(),
        exportVersion: "1.0",
        format: "json",
        data,
      },
      "Personal data export generated",
    );
  }

  static async restrictProcessing(userId: string, reason?: string) {
    const memberships = await PrivacyService.getActiveMemberships(userId);

    await PrivacyRepository.disableAllNotifications(userId);

    if (memberships.length) {
      await AuditLogsService.logMany(
        memberships.map((m) => ({
          workspace_id: m.workspaceId,
          user_id: userId,
          action: "privacy.processing_restricted",
          entity: "user",
          entity_id: userId,
          after: {
            reason: reason || null,
            channels_disabled: [
              "email_enabled",
              "whatsapp_enabled",
              "push_enabled",
              "marketing_enabled",
            ],
          },
        })),
      );
    }

    await PrivacyService.createRequest({
      userId,
      requestType: "restrict",
      status: "completed",
      reason,
      result: {
        restricted: true,
        affectedWorkspaces: memberships.length,
      },
    });

    return buildSuccess(
      {
        restricted: true,
        affectedWorkspaces: memberships.length,
      },
      "Processing restriction has been applied",
    );
  }

  static async erasePersonalData(userId: string, confirmation: string) {
    if (confirmation !== ERASURE_CONFIRMATION_TEXT) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid confirmation. Send '${ERASURE_CONFIRMATION_TEXT}' to continue.`,
        ),
      );
    }

    const memberships = await PrivacyService.getActiveMemberships(userId);
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const anonymizedEmail = `deleted+${userId}@redacted.invalid`;

    await PrivacyRepository.runTransaction(async (tx) => {
      await PrivacyRepository.disableAllNotifications(userId, tx);
      await PrivacyRepository.softDeleteAllNotifications(userId, tx);
      await PrivacyRepository.softDeleteAllMemberships(userId, tx);
      await PrivacyRepository.anonymizeUser(
        userId,
        {
          email: anonymizedEmail,
          name: null,
          profile_picture: null,
          mobile: null,
          oauth_provider: null,
          providers: null,
          workspace_id: null,
          system_role: "user",
          updated_at: new Date(),
        },
        tx,
      );
    });

    if (workspaceIds.length) {
      await AuditLogsService.logMany(
        workspaceIds.map((workspaceId) => ({
          workspace_id: workspaceId,
          user_id: userId,
          action: "privacy.erasure_applied",
          entity: "user",
          entity_id: userId,
          after: {
            anonymized: true,
          },
        })),
      );
    }

    await PrivacyService.createRequest({
      userId,
      requestType: "erasure",
      status: "completed",
      payload: { confirmation: "provided" },
      result: {
        erased: true,
        anonymized: true,
        membershipsRevoked: workspaceIds.length,
      },
    });

    return buildSuccess(
      {
        erased: true,
        anonymized: true,
        membershipsRevoked: workspaceIds.length,
      },
      "Personal data erasure has been applied",
    );
  }

  static async submitRequest(
    userId: string,
    requestType: PrivacyRequestType,
    reason?: string,
  ) {
    const request = await PrivacyService.createRequest({
      userId,
      requestType,
      reason,
      status: "received",
    });

    return buildSuccess(request, "Privacy request submitted");
  }

  static async listMyRequests(
    userId: string,
    query?: {
      page?: number;
      limit?: number;
      status?: string;
      requestType?: string;
    },
  ) {
    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 20);
    const offset = (page - 1) * limit;

    const filters: { status?: string; requestType?: string } = {};

    if (query?.status) {
      filters.status = query.status;
    }
    if (query?.requestType) {
      filters.requestType = query.requestType;
    }

    const rows = await PrivacyRepository.listMyRequests(
      userId,
      filters,
      limit,
      offset,
    );
    const total = await PrivacyRepository.countMyRequests(userId, filters);
    const now = new Date();

    return buildSuccess({
      rows: rows.map((row) => ({
        ...row,
        is_overdue:
          !!row.due_at &&
          row.status !== "completed" &&
          row.status !== "rejected" &&
          new Date(row.due_at) < now,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  static async listAllRequests(query?: {
    page?: number;
    limit?: number;
    status?: string;
    requestType?: string;
    userId?: string;
  }) {
    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 20);
    const offset = (page - 1) * limit;

    const filters: { status?: string; requestType?: string; userId?: string } =
      {};

    if (query?.status) {
      filters.status = query.status;
    }
    if (query?.requestType) {
      filters.requestType = query.requestType;
    }
    if (query?.userId) {
      filters.userId = query.userId;
    }

    const rows = await PrivacyRepository.listAllRequests(
      filters,
      limit,
      offset,
    );
    const total = await PrivacyRepository.countAllRequests(filters);
    const now = new Date();

    return buildSuccess({
      rows: rows.map((row) => ({
        ...row,
        is_overdue:
          !!row.due_at &&
          row.status !== "completed" &&
          row.status !== "rejected" &&
          new Date(row.due_at) < now,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  static async getRequestByIdForUser(userId: string, requestId: string) {
    const request = await PrivacyRepository.getRequestByIdForUser(
      requestId,
      userId,
    );

    if (!request) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Request not found"));
    }

    return buildSuccess(request, "Request retrieved");
  }

  static async getRequestByIdForAdmin(requestId: string) {
    const request = await PrivacyRepository.getRequestByIdForAdmin(requestId);

    if (!request) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Request not found"));
    }

    return buildSuccess(request, "Request retrieved");
  }

  static async updateRequestStatus(
    requestId: string,
    reviewerId: string,
    statusValue: PrivacyRequestStatus,
    note?: string,
    closedReason?: string,
  ) {
    const now = new Date();
    const dueAt =
      statusValue === "completed" || statusValue === "rejected"
        ? null
        : PrivacyService.addDays(now, 30);

    const updated = await PrivacyRepository.updateRequestStatus(requestId, {
      status: statusValue,
      note: note ?? null,
      closed_reason:
        statusValue === "completed" || statusValue === "rejected"
          ? (closedReason ?? null)
          : null,
      reviewed_by: reviewerId,
      reviewed_at: now,
      due_at: dueAt,
      completed_at: statusValue === "completed" ? now : null,
      updated_at: now,
    });

    if (!updated) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Request not found"));
    }

    return buildSuccess(updated, "Request status updated");
  }
}
