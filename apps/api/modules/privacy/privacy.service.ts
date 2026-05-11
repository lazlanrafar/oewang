import {
  and,
  audit_logs,
  db,
  desc,
  eq,
  inArray,
  isNull,
  notification_settings,
  notifications,
  orders,
  privacy_requests,
  sql,
  transactions,
  user_workspaces,
  users,
  workspaces,
} from "@workspace/database";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { AuditLogsService } from "../audit-logs/audit-logs.service";

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
        : this.addDays(now, 30);
    const [request] = await db
      .insert(privacy_requests)
      .values({
        user_id: data.userId,
        request_type: data.requestType,
        status: data.status ?? "received",
        reason: data.reason ?? null,
        payload: (data.payload as any) ?? null,
        result: (data.result as any) ?? null,
        note: data.note ?? null,
        reviewed_by: data.reviewedBy ?? null,
        reviewed_at: data.reviewedBy ? now : null,
        due_at: dueAt,
        completed_at: data.status === "completed" ? now : null,
        updated_at: now,
      })
      .returning();

    return request;
  }

  private static async getActiveMemberships(userId: string) {
    return db
      .select({
        workspaceId: user_workspaces.workspace_id,
        role: user_workspaces.role,
        joined_at: user_workspaces.joined_at,
        workspace_name: workspaces.name,
        workspace_slug: workspaces.slug,
      })
      .from(user_workspaces)
      .innerJoin(workspaces, eq(user_workspaces.workspace_id, workspaces.id))
      .where(
        and(
          eq(user_workspaces.user_id, userId),
          isNull(user_workspaces.deleted_at),
          isNull(workspaces.deleted_at),
        ),
      );
  }

  private static async buildSubjectData(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        mobile: users.mobile,
        profile_picture: users.profile_picture,
        oauth_provider: users.oauth_provider,
        providers: users.providers,
        workspaceId: users.workspace_id,
        system_role: users.system_role,
        createdAt: users.created_at,
        updatedAt: users.updated_at,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw status(404, buildError(ErrorCode.USER_NOT_FOUND, "User not found"));
    }

    const memberships = await this.getActiveMemberships(userId);
    const workspaceIds = memberships.map((m) => m.workspaceId);

    const [
      notificationSettings,
      userNotifications,
      userOrders,
      assignedTransactions,
      userAuditLogs,
    ] = await Promise.all([
      db
        .select({
          id: notification_settings.id,
          workspaceId: notification_settings.workspace_id,
          email_enabled: notification_settings.email_enabled,
          whatsapp_enabled: notification_settings.whatsapp_enabled,
          push_enabled: notification_settings.push_enabled,
          marketing_enabled: notification_settings.marketing_enabled,
          createdAt: notification_settings.created_at,
          updatedAt: notification_settings.updated_at,
          deletedAt: notification_settings.deleted_at,
        })
        .from(notification_settings)
        .where(eq(notification_settings.user_id, userId)),
      db
        .select({
          id: notifications.id,
          workspaceId: notifications.workspace_id,
          type: notifications.type,
          title: notifications.title,
          message: notifications.message,
          is_read: notifications.is_read,
          link: notifications.link,
          createdAt: notifications.created_at,
          deletedAt: notifications.deleted_at,
        })
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .limit(500),
      db
        .select({
          id: orders.id,
          workspaceId: orders.workspace_id,
          amount: orders.amount,
          currency: orders.currency,
          status: orders.status,
          manual: orders.manual,
          createdAt: orders.created_at,
          updatedAt: orders.updated_at,
          deletedAt: orders.deleted_at,
        })
        .from(orders)
        .where(eq(orders.user_id, userId))
        .limit(500),
      workspaceIds.length
        ? db
            .select({
              id: transactions.id,
              workspaceId: transactions.workspaceId,
              walletId: transactions.walletId,
              toWalletId: transactions.toWalletId,
              categoryId: transactions.categoryId,
              assignedUserId: transactions.assignedUserId,
              amount: transactions.amount,
              date: transactions.date,
              type: transactions.type,
              description: transactions.description,
              name: transactions.name,
              createdAt: transactions.createdAt,
              updatedAt: transactions.updatedAt,
              isReady: transactions.isReady,
              isExported: transactions.isExported,
              deletedAt: transactions.deletedAt,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.assignedUserId, userId),
                inArray(transactions.workspaceId, workspaceIds),
              ),
            )
            .limit(1000)
        : Promise.resolve([]),
      db
        .select({
          id: audit_logs.id,
          workspaceId: audit_logs.workspace_id,
          action: audit_logs.action,
          entity: audit_logs.entity,
          entity_id: audit_logs.entity_id,
          before: audit_logs.before,
          after: audit_logs.after,
          createdAt: audit_logs.created_at,
          deletedAt: audit_logs.deleted_at,
        })
        .from(audit_logs)
        .where(eq(audit_logs.user_id, userId))
        .limit(1000),
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
    const data = await this.buildSubjectData(userId);
    await this.createRequest({
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
    const data = await this.buildSubjectData(userId);
    await this.createRequest({
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
    const memberships = await this.getActiveMemberships(userId);

    await db
      .update(notification_settings)
      .set({
        email_enabled: false,
        whatsapp_enabled: false,
        push_enabled: false,
        marketing_enabled: false,
        updated_at: new Date(),
      })
      .where(eq(notification_settings.user_id, userId));

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

    await this.createRequest({
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

    const memberships = await this.getActiveMemberships(userId);
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const anonymizedEmail = `deleted+${userId}@redacted.invalid`;

    await db.transaction(async (tx) => {
      await tx
        .update(notification_settings)
        .set({
          email_enabled: false,
          whatsapp_enabled: false,
          push_enabled: false,
          marketing_enabled: false,
          updated_at: new Date(),
        })
        .where(eq(notification_settings.user_id, userId));

      await tx
        .update(notifications)
        .set({ deleted_at: new Date() })
        .where(
          and(
            eq(notifications.user_id, userId),
            isNull(notifications.deleted_at),
          ),
        );

      await tx
        .update(user_workspaces)
        .set({ deleted_at: new Date() })
        .where(
          and(
            eq(user_workspaces.user_id, userId),
            isNull(user_workspaces.deleted_at),
          ),
        );

      await tx
        .update(users)
        .set({
          email: anonymizedEmail,
          name: null,
          profile_picture: null,
          mobile: null,
          oauth_provider: null,
          providers: null,
          workspace_id: null,
          system_role: "user",
          updated_at: new Date(),
        })
        .where(eq(users.id, userId));
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

    await this.createRequest({
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
    const request = await this.createRequest({
      userId,
      requestType,
      reason,
      status: "received",
    });

    return buildSuccess(request, "Privacy request submitted");
  }

  static async listMyRequests(
    userId: string,
    query?: { page?: number; limit?: number; status?: string; requestType?: string },
  ) {
    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 20);
    const offset = (page - 1) * limit;

    const conditions = [
      eq(privacy_requests.user_id, userId),
      isNull(privacy_requests.deleted_at),
    ];

    if (query?.status) {
      conditions.push(eq(privacy_requests.status, query.status));
    }
    if (query?.requestType) {
      conditions.push(eq(privacy_requests.request_type, query.requestType));
    }

    const rows = await db
        .select()
        .from(privacy_requests)
        .where(and(...conditions))
        .orderBy(desc(privacy_requests.created_at))
        .limit(limit)
        .offset(offset);

    const [count] = await db
      .select({ total: sql<number>`count(*)` })
      .from(privacy_requests)
      .where(and(...conditions));

    const total = Number(count?.total ?? 0);
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

    const conditions = [isNull(privacy_requests.deleted_at)];

    if (query?.status) {
      conditions.push(eq(privacy_requests.status, query.status));
    }
    if (query?.requestType) {
      conditions.push(eq(privacy_requests.request_type, query.requestType));
    }
    if (query?.userId) {
      conditions.push(eq(privacy_requests.user_id, query.userId));
    }

    const rows = await db
      .select({
        id: privacy_requests.id,
        user_id: privacy_requests.user_id,
        request_type: privacy_requests.request_type,
        status: privacy_requests.status,
        reason: privacy_requests.reason,
        payload: privacy_requests.payload,
        result: privacy_requests.result,
        note: privacy_requests.note,
        reviewed_by: privacy_requests.reviewed_by,
        reviewed_at: privacy_requests.reviewed_at,
        due_at: privacy_requests.due_at,
        completed_at: privacy_requests.completed_at,
        closed_reason: privacy_requests.closed_reason,
        createdAt: privacy_requests.created_at,
        updatedAt: privacy_requests.updated_at,
        user_email: users.email,
      })
      .from(privacy_requests)
      .leftJoin(users, eq(privacy_requests.user_id, users.id))
      .where(and(...conditions))
      .orderBy(desc(privacy_requests.created_at))
      .limit(limit)
      .offset(offset);

    const [count] = await db
      .select({ total: sql<number>`count(*)` })
      .from(privacy_requests)
      .where(and(...conditions));

    const total = Number(count?.total ?? 0);
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
    const [request] = await db
      .select()
      .from(privacy_requests)
      .where(
        and(
          eq(privacy_requests.id, requestId),
          eq(privacy_requests.user_id, userId),
          isNull(privacy_requests.deleted_at),
        ),
      )
      .limit(1);

    if (!request) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Request not found"));
    }

    return buildSuccess(request, "Request retrieved");
  }

  static async getRequestByIdForAdmin(requestId: string) {
    const [request] = await db
      .select({
        id: privacy_requests.id,
        user_id: privacy_requests.user_id,
        request_type: privacy_requests.request_type,
        status: privacy_requests.status,
        reason: privacy_requests.reason,
        payload: privacy_requests.payload,
        result: privacy_requests.result,
        note: privacy_requests.note,
        reviewed_by: privacy_requests.reviewed_by,
        reviewed_at: privacy_requests.reviewed_at,
        due_at: privacy_requests.due_at,
        completed_at: privacy_requests.completed_at,
        closed_reason: privacy_requests.closed_reason,
        createdAt: privacy_requests.created_at,
        updatedAt: privacy_requests.updated_at,
        user_email: users.email,
      })
      .from(privacy_requests)
      .leftJoin(users, eq(privacy_requests.user_id, users.id))
      .where(
        and(
          eq(privacy_requests.id, requestId),
          isNull(privacy_requests.deleted_at),
        ),
      )
      .limit(1);

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
        : this.addDays(now, 30);
    const [updated] = await db
      .update(privacy_requests)
      .set({
        status: statusValue,
        note: note ?? null,
        closed_reason:
          statusValue === "completed" || statusValue === "rejected"
            ? closedReason ?? null
            : null,
        reviewed_by: reviewerId,
        reviewed_at: now,
        due_at: dueAt,
        completed_at: statusValue === "completed" ? now : null,
        updated_at: now,
      })
      .where(
        and(
          eq(privacy_requests.id, requestId),
          isNull(privacy_requests.deleted_at),
        ),
      )
      .returning();

    if (!updated) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Request not found"));
    }

    return buildSuccess(updated, "Request status updated");
  }
}
