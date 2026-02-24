import {
  db,
  transactions,
  and,
  eq,
  isNull,
  gte,
  sql,
} from "@workspace/database";
import { subMonths, startOfMonth } from "date-fns";

export abstract class MetricsRepository {
  /**
   * Gets the total sum of transactions of a specific type
   * grouped by month over the last 12 months.
   */
  static async getMonthlyTotalsByType(
    workspaceId: string,
    type: "income" | "expense",
    monthsAgo = 11,
  ) {
    const startDate = startOfMonth(subMonths(new Date(), monthsAgo));

    const result = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${transactions.date}::timestamp), 'Mon ''YY')`,
        total: sql<number>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.type, type),
          gte(transactions.date, startDate.toISOString()),
          isNull(transactions.deletedAt),
        ),
      )
      .groupBy(sql`date_trunc('month', ${transactions.date}::timestamp)`)
      .orderBy(sql`date_trunc('month', ${transactions.date}::timestamp)`);

    return result;
  }
}
