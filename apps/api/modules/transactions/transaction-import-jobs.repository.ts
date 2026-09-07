import type { NewTransactionImportJob } from "@workspace/database";
import { and, db, eq, transactionImportJobs } from "@workspace/database";

export abstract class TransactionImportJobsRepository {
  static async create(data: NewTransactionImportJob) {
    const [row] = await db
      .insert(transactionImportJobs)
      .values(data)
      .returning();
    if (!row) {
      throw new Error("Failed to create transaction import job");
    }
    return row;
  }

  // Scoped to workspace_id so a job id from one workspace can't be polled by
  // another — the worker itself never reads this row, only apps/api does
  // (on enqueue and on each poll).
  static async findByIdForWorkspace(id: string, workspace_id: string) {
    const [row] = await db
      .select()
      .from(transactionImportJobs)
      .where(
        and(
          eq(transactionImportJobs.id, id),
          eq(transactionImportJobs.workspaceId, workspace_id),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
