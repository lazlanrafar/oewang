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

export abstract class PrivacyRepository {
  static async runTransaction<T>(
    callback: (tx: any) => Promise<T>,
  ): Promise<T> {
    return db.transaction(callback);
  }

  static async createRequest(data: {
    user_id: string;
    request_type: "access" | "export" | "restrict" | "erasure";
    status: "received" | "in_progress" | "completed" | "rejected";
    reason: string | null;
    payload: any;
    result: any;
    note: string | null;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    due_at: Date | null;
    completed_at: Date | null;
    updated_at: Date;
  }) {
    const [request] = await db
      .insert(privacy_requests)
      .values(data)
      .returning();
    return request ?? null;
  }

  static async getActiveMemberships(userId: string) {
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

  static async getUserById(userId: string) {
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
    return user ?? null;
  }

  static async getNotificationSettings(userId: string) {
    return db
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
      .where(eq(notification_settings.user_id, userId));
  }

  static async getNotifications(userId: string, limit: number) {
    return db
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
      .limit(limit);
  }

  static async getOrders(userId: string, limit: number) {
    return db
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
      .limit(limit);
  }

  static async getAssignedTransactions(
    userId: string,
    workspaceIds: string[],
    limit: number,
  ) {
    if (workspaceIds.length === 0) return [];
    return db
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
      .limit(limit);
  }

  static async getAuditLogs(userId: string, limit: number) {
    return db
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
      .limit(limit);
  }

  static async disableAllNotifications(userId: string, tx: any = db) {
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
  }

  static async softDeleteAllNotifications(userId: string, tx: any = db) {
    await tx
      .update(notifications)
      .set({ deleted_at: new Date() })
      .where(
        and(
          eq(notifications.user_id, userId),
          isNull(notifications.deleted_at),
        ),
      );
  }

  static async softDeleteAllMemberships(userId: string, tx: any = db) {
    await tx
      .update(user_workspaces)
      .set({ deleted_at: new Date() })
      .where(
        and(
          eq(user_workspaces.user_id, userId),
          isNull(user_workspaces.deleted_at),
        ),
      );
  }

  static async anonymizeUser(userId: string, data: any, tx: any = db) {
    await tx.update(users).set(data).where(eq(users.id, userId));
  }

  static async listMyRequests(
    userId: string,
    filters: { status?: string; requestType?: string },
    limit: number,
    offset: number,
  ) {
    const conditions = [
      eq(privacy_requests.user_id, userId),
      isNull(privacy_requests.deleted_at),
    ];
    if (filters.status) {
      conditions.push(eq(privacy_requests.status, filters.status));
    }
    if (filters.requestType) {
      conditions.push(eq(privacy_requests.request_type, filters.requestType));
    }

    return db
      .select()
      .from(privacy_requests)
      .where(and(...conditions))
      .orderBy(desc(privacy_requests.created_at))
      .limit(limit)
      .offset(offset);
  }

  static async countMyRequests(
    userId: string,
    filters: { status?: string; requestType?: string },
  ) {
    const conditions = [
      eq(privacy_requests.user_id, userId),
      isNull(privacy_requests.deleted_at),
    ];
    if (filters.status) {
      conditions.push(eq(privacy_requests.status, filters.status));
    }
    if (filters.requestType) {
      conditions.push(eq(privacy_requests.request_type, filters.requestType));
    }

    const [count] = await db
      .select({ total: sql<number>`count(*)` })
      .from(privacy_requests)
      .where(and(...conditions));
    return Number(count?.total ?? 0);
  }

  static async listAllRequests(
    filters: { status?: string; requestType?: string; userId?: string },
    limit: number,
    offset: number,
  ) {
    const conditions = [isNull(privacy_requests.deleted_at)];
    if (filters.status) {
      conditions.push(eq(privacy_requests.status, filters.status));
    }
    if (filters.requestType) {
      conditions.push(eq(privacy_requests.request_type, filters.requestType));
    }
    if (filters.userId) {
      conditions.push(eq(privacy_requests.user_id, filters.userId));
    }

    return db
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
  }

  static async countAllRequests(filters: {
    status?: string;
    requestType?: string;
    userId?: string;
  }) {
    const conditions = [isNull(privacy_requests.deleted_at)];
    if (filters.status) {
      conditions.push(eq(privacy_requests.status, filters.status));
    }
    if (filters.requestType) {
      conditions.push(eq(privacy_requests.request_type, filters.requestType));
    }
    if (filters.userId) {
      conditions.push(eq(privacy_requests.user_id, filters.userId));
    }

    const [count] = await db
      .select({ total: sql<number>`count(*)` })
      .from(privacy_requests)
      .where(and(...conditions));
    return Number(count?.total ?? 0);
  }

  static async getRequestByIdForUser(requestId: string, userId: string) {
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
    return request ?? null;
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
    return request ?? null;
  }

  static async updateRequestStatus(requestId: string, data: any) {
    const [updated] = await db
      .update(privacy_requests)
      .set(data)
      .where(
        and(
          eq(privacy_requests.id, requestId),
          isNull(privacy_requests.deleted_at),
        ),
      )
      .returning();
    return updated ?? null;
  }
}
