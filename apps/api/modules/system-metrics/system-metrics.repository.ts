import { db, orders, users, workspaces } from "@workspace/database";
import { sql, and, gte, lte, eq, isNull, ne } from "drizzle-orm";

export abstract class SystemMetricsRepository {
  static async getOverviewMetrics(startDate?: Date, endDate?: Date) {
    const orderDateFilter = [];
    if (startDate) orderDateFilter.push(gte(orders.created_at, startDate));
    if (endDate) orderDateFilter.push(lte(orders.created_at, endDate));

    const [revenueResult] = await db
      .select({ total: sql<number>`sum(${orders.amount})` })
      .from(orders)
      .where(and(eq(orders.status, "paid"), ...orderDateFilter));

    const userDateFilter = [];
    if (startDate) userDateFilter.push(gte(users.created_at, startDate));
    if (endDate) userDateFilter.push(lte(users.created_at, endDate));

    const [usersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...userDateFilter));

    const [ordersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(...orderDateFilter));

    const workspaceDateFilter = [];
    if (startDate)
      workspaceDateFilter.push(gte(workspaces.created_at, startDate));
    if (endDate) workspaceDateFilter.push(lte(workspaces.created_at, endDate));

    const [workspacesResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(workspaces)
      .where(
        and(
          isNull(workspaces.deleted_at),
          ne(workspaces.plan_status, "free"),
          ...workspaceDateFilter,
        ),
      );

    return {
      totalRevenue: Number(revenueResult?.total || 0),
      totalUsers: Number(usersResult?.count || 0),
      totalOrders: Number(ordersResult?.count || 0),
      activeWorkspaces: Number(workspacesResult?.count || 0),
    };
  }

  static async getRevenueTimeSeries(startDate?: Date, endDate?: Date) {
    const dateFilter = [];
    if (startDate) dateFilter.push(gte(orders.created_at, startDate));
    if (endDate) dateFilter.push(lte(orders.created_at, endDate));

    const result = await db
      .select({
        date: sql<string>`DATE(${orders.created_at})`,
        revenue: sql<number>`sum(${orders.amount})`,
      })
      .from(orders)
      .where(and(eq(orders.status, "paid"), ...dateFilter))
      .groupBy(sql`DATE(${orders.created_at})`)
      .orderBy(sql`DATE(${orders.created_at})`);

    return result.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue || 0),
    }));
  }
}
