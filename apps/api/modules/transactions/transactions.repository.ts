import {
  categories,
  contacts,
  db,
  debtPayments,
  debts,
  transactionAttachments,
  transactions,
  users,
  vaultFiles,
  wallets,
} from "@workspace/database";
import type { Transaction } from "@workspace/types";
import {
  aliasedTable,
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

type TransactionConnection =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export abstract class TransactionsRepository {
  static async create(
    data: typeof transactions.$inferInsert,
    tx: any = db,
  ): Promise<Transaction> {
    const [transaction] = await tx
      .insert(transactions)
      .values(data)
      .returning();

    if (!transaction) {
      throw new Error("Failed to create transaction");
    }

    return {
      ...transaction,
      date: transaction.date,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      isReady: transaction.isReady,
      isExported: transaction.isExported,
      deletedAt: transaction.deletedAt,
    } as unknown as Transaction;
  }

  /**
   * Idempotent counterpart to `create`, used by the mobile offline sync
   * flush: the client generates the row's CUID2 up front, so a retried sync
   * (interrupted before the client saw the response) must land on the same
   * row instead of inserting a duplicate. `inserted: false` tells the caller
   * this is a replay — skip wallet-balance deltas, audit logs, and
   * notifications, since the first successful attempt already ran them.
   */
  static async createIdempotent(
    data: typeof transactions.$inferInsert,
    tx: any = db,
  ): Promise<{ transaction: Transaction; inserted: boolean }> {
    const [inserted] = await tx
      .insert(transactions)
      .values(data)
      .onConflictDoNothing({ target: transactions.id })
      .returning();

    if (inserted) {
      return {
        transaction: {
          ...inserted,
          date: inserted.date,
          createdAt: inserted.createdAt,
          updatedAt: inserted.updatedAt,
          isReady: inserted.isReady,
          isExported: inserted.isExported,
          deletedAt: inserted.deletedAt,
        } as unknown as Transaction,
        inserted: true,
      };
    }

    // Conflict: a prior attempt already created this row.
    const existing = await TransactionsRepository.findById(
      data.workspaceId as string,
      data.id as string,
      tx,
    );
    if (!existing) {
      throw new Error("Failed to create transaction");
    }
    return { transaction: existing, inserted: false };
  }

  static async createMany(
    data: (typeof transactions.$inferInsert)[],
    tx: any = db,
  ): Promise<{ transaction: Transaction; inserted: boolean }[]> {
    if (data.length === 0) return [];

    // onConflictDoNothing + returning() yields only the rows genuinely
    // inserted here — rows whose (client-generated) id already existed from
    // a prior sync attempt are silently skipped by Postgres, not returned.
    const insertedRows = await tx
      .insert(transactions)
      .values(data)
      .onConflictDoNothing({ target: transactions.id })
      .returning();

    const insertedIds = new Set(insertedRows.map((r: any) => r.id));
    const skippedIds = data
      .map((d) => d.id)
      .filter((id): id is string => !!id && !insertedIds.has(id));

    // Re-fetch the skipped (already-existing) rows so the response still
    // accounts for every requested id — the mobile sync flush needs to clear
    // its local pending flag for those too, not just the freshly-inserted ones.
    const existingRows =
      skippedIds.length > 0
        ? await tx
            .select()
            .from(transactions)
            .where(
              and(
                inArray(transactions.id, skippedIds),
                eq(transactions.workspaceId, data[0]!.workspaceId),
                isNull(transactions.deletedAt),
              ),
            )
        : [];

    if (existingRows.length !== new Set(skippedIds).size) {
      throw new Error("Transaction ID is unavailable");
    }

    const mapRow = (row: any, inserted: boolean) => ({
      transaction: {
        ...row,
        date: row.date,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
      } as unknown as Transaction,
      inserted,
    });

    return [
      ...insertedRows.map((r: any) => mapRow(r, true)),
      ...existingRows.map((r: any) => mapRow(r, false)),
    ];
  }

  static async findById(
    workspaceId: string,
    id: string,
    tx: TransactionConnection = db,
  ): Promise<Transaction | undefined> {
    const fromWallet = aliasedTable(wallets, "fromWallet");
    const toWallet = aliasedTable(wallets, "toWallet");

    const [result] = await tx
      .select({
        transaction: transactions,
        wallet: { id: fromWallet.id, name: fromWallet.name },
        toWallet: { id: toWallet.id, name: toWallet.name },
        category: { id: categories.id, name: categories.name },
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          profile_picture: users.profile_picture,
        },
      })
      .from(transactions)
      .leftJoin(fromWallet, eq(transactions.walletId, fromWallet.id))
      .leftJoin(toWallet, eq(transactions.toWalletId, toWallet.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(users, eq(transactions.assignedUserId, users.id))
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.id, id),
          isNull(transactions.deletedAt),
        ),
      );

    if (!result) return undefined;

    // Fetch attachments
    const attachments = await TransactionsRepository.findAttachments(
      id,
      workspaceId,
    );

    return {
      ...result.transaction,
      date: result.transaction.date,
      createdAt: result.transaction.createdAt,
      updatedAt: result.transaction.updatedAt,
      isReady: result.transaction.isReady,
      isExported: result.transaction.isExported,
      deletedAt: result.transaction.deletedAt,
      wallet: result.wallet,
      toWallet: result.toWallet,
      category: result.category,
      user: result.user,
      attachments,
    } as unknown as Transaction;
  }

  static async list(
    workspaceId: string,
    params: {
      page: number;
      limit: number;
      type?: string | string[];
      walletId?: string | string[];
      categoryId?: string | string[];
      startDate?: string;
      endDate?: string;
      minAmount?: number;
      maxAmount?: number;
      hasAttachments?: boolean;
      search?: string;
      uncategorized?: boolean;
    },
  ): Promise<{ data: Transaction[]; total: number }> {
    const fromWallet = aliasedTable(wallets, "fromWallet");
    const toWallet = aliasedTable(wallets, "toWallet");

    const filters = [
      eq(transactions.workspaceId, workspaceId),
      isNull(transactions.deletedAt),
    ];

    if (params.type) {
      if (Array.isArray(params.type)) {
        filters.push(inArray(transactions.type, params.type));
      } else {
        filters.push(eq(transactions.type, params.type));
      }
    }
    if (params.walletId) {
      if (Array.isArray(params.walletId)) {
        filters.push(inArray(transactions.walletId, params.walletId));
      } else {
        filters.push(eq(transactions.walletId, params.walletId));
      }
    }
    if (params.categoryId) {
      if (Array.isArray(params.categoryId)) {
        filters.push(inArray(transactions.categoryId, params.categoryId));
      } else {
        filters.push(eq(transactions.categoryId, params.categoryId));
      }
    }
    if (params.startDate) {
      filters.push(gte(transactions.date, params.startDate));
    }
    if (params.endDate) {
      filters.push(lte(transactions.date, params.endDate));
    }
    if (params.minAmount !== undefined) {
      filters.push(gte(transactions.amount, String(params.minAmount)));
    }
    if (params.maxAmount !== undefined) {
      filters.push(lte(transactions.amount, String(params.maxAmount)));
    }
    if (params.hasAttachments !== undefined) {
      const existsSubquery = db
        .select({ id: transactionAttachments.id })
        .from(transactionAttachments)
        .where(
          and(
            eq(transactionAttachments.transactionId, transactions.id),
            isNull(transactionAttachments.deletedAt),
          ),
        );

      if (params.hasAttachments) {
        filters.push(sql`exists (${existsSubquery})`);
      } else {
        filters.push(sql`not exists (${existsSubquery})`);
      }
    }
    if (params.search) {
      filters.push(
        or(
          ilike(transactions.name, `%${params.search}%`),
          ilike(transactions.description, `%${params.search}%`),
        ) as any,
      );
    }
    if (params.uncategorized) {
      filters.push(isNull(transactions.categoryId));
    }

    const results = await db
      .select({
        transaction: transactions,
        wallet: { id: fromWallet.id, name: fromWallet.name },
        toWallet: { id: toWallet.id, name: toWallet.name },
        category: { id: categories.id, name: categories.name },
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          profile_picture: users.profile_picture,
        },
        // Single scan: total rides along with the page (leftJoins are all
        // to-one, so this equals count of matching transactions).
        total: sql<number>`count(*) over()`,
      })
      .from(transactions)
      .leftJoin(fromWallet, eq(transactions.walletId, fromWallet.id))
      .leftJoin(toWallet, eq(transactions.toWalletId, toWallet.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(users, eq(transactions.assignedUserId, users.id))
      .where(and(...filters))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit)
      .orderBy(desc(transactions.date), desc(transactions.createdAt));

    const data = results.map((row) => ({
      ...row.transaction,
      date: row.transaction.date,
      createdAt: row.transaction.createdAt,
      updatedAt: row.transaction.updatedAt,
      isReady: row.transaction.isReady,
      isExported: row.transaction.isExported,
      deletedAt: row.transaction.deletedAt,
      wallet: row.wallet,
      toWallet: row.toWallet,
      category: row.category,
      user: row.user,
    }));

    // Fetch attachments for the whole page
    const transactionIds = data.map((t) => t.id);
    const allAttachments: Record<string, any[]> = {};

    if (transactionIds.length > 0) {
      const attachmentsQuery = await db
        .select({
          transactionId: transactionAttachments.transactionId,
          id: vaultFiles.id,
          name: vaultFiles.name,
          key: vaultFiles.key,
          size: vaultFiles.size,
          type: vaultFiles.type,
          tags: vaultFiles.tags,
        })
        .from(transactionAttachments)
        .innerJoin(
          vaultFiles,
          eq(transactionAttachments.vaultFileId, vaultFiles.id),
        )
        .where(
          and(
            inArray(transactionAttachments.transactionId, transactionIds),
            eq(transactionAttachments.workspaceId, workspaceId),
            isNull(vaultFiles.deletedAt),
          ),
        );

      for (const row of attachmentsQuery) {
        const tId = row.transactionId;
        if (tId) {
          if (!allAttachments[tId]) {
            allAttachments[tId] = [];
          }
          allAttachments[tId]!.push({
            id: row.id,
            name: row.name,
            key: row.key,
            size: row.size,
            type: row.type,
            tags: row.tags,
          });
        }
      }
    }

    const dataWithAttachments = data.map((t) => ({
      ...t,
      attachments: allAttachments[t.id] || [],
    }));

    return {
      data: dataWithAttachments as unknown as Transaction[],
      total: results.length ? Number(results[0]?.total ?? 0) : 0,
    };
  }

  /**
   * Lean projection for CSV export: only the columns the CSV needs, no
   * attachment batch, no count, no user join. Caller pages via offset/limit so
   * a large export never materializes the whole table at once.
   */
  static async listForExport(
    workspaceId: string,
    params: {
      startDate?: string;
      endDate?: string;
      offset: number;
      limit: number;
    },
  ): Promise<
    {
      date: string;
      type: string;
      amount: string;
      categoryName: string | null;
      walletName: string | null;
      toWalletName: string | null;
      description: string | null;
    }[]
  > {
    const fromWallet = aliasedTable(wallets, "fromWallet");
    const toWallet = aliasedTable(wallets, "toWallet");

    const filters = [
      eq(transactions.workspaceId, workspaceId),
      isNull(transactions.deletedAt),
    ];
    if (params.startDate)
      filters.push(gte(transactions.date, params.startDate));
    if (params.endDate) filters.push(lte(transactions.date, params.endDate));

    return db
      .select({
        date: transactions.date,
        type: transactions.type,
        amount: transactions.amount,
        categoryName: categories.name,
        walletName: fromWallet.name,
        toWalletName: toWallet.name,
        description: transactions.description,
      })
      .from(transactions)
      .leftJoin(fromWallet, eq(transactions.walletId, fromWallet.id))
      .leftJoin(toWallet, eq(transactions.toWalletId, toWallet.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...filters))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(params.limit)
      .offset(params.offset);
  }

  /**
   * Fuzzy-search past transactions by name for the AI "quick recall" feature.
   * Returns the raw matching rows (most recent first) so the caller can
   * aggregate them into per-name price suggestions. Excludes transfers since
   * they are not recordable expenses/income the user would "buy" again.
   */
  static async searchByName(
    workspaceId: string,
    query: string,
    limit = 30,
  ): Promise<
    {
      name: string | null;
      amount: string;
      type: string;
      date: string;
      walletId: string;
      walletName: string | null;
      categoryId: string | null;
      categoryName: string | null;
    }[]
  > {
    const trimmed = query.trim();
    if (!trimmed) return [];

    return db
      .select({
        name: transactions.name,
        amount: transactions.amount,
        type: transactions.type,
        date: transactions.date,
        walletId: transactions.walletId,
        walletName: wallets.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          isNull(transactions.deletedAt),
          ilike(transactions.name, `%${trimmed}%`),
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit);
  }

  static async update(
    workspaceId: string,
    id: string,
    data: Partial<typeof transactions.$inferInsert>,
    tx: TransactionConnection = db,
  ): Promise<Transaction | undefined> {
    const [transaction] = await tx
      .update(transactions)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.id, id),
          isNull(transactions.deletedAt),
        ),
      )
      .returning();

    if (transaction) {
      return TransactionsRepository.findById(workspaceId, id, tx);
    }

    return undefined;
  }

  static async delete(
    workspaceId: string,
    id: string,
  ): Promise<Transaction | undefined> {
    const [transaction] = await db
      .update(transactions)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.id, id),
          isNull(transactions.deletedAt),
        ),
      )
      .returning();

    return transaction as unknown as Transaction | undefined;
  }

  static async deleteMany(
    workspaceId: string,
    ids: string[],
    tx: any = db,
  ): Promise<Transaction[]> {
    if (ids.length === 0) return [];

    const results = await tx
      .update(transactions)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          inArray(transactions.id, ids),
          isNull(transactions.deletedAt),
        ),
      )
      .returning();

    return results as unknown as Transaction[];
  }

  // ── Attachments ──────────────────────────────────────────────────────────

  static async findAttachments(transactionId: string, workspaceId: string) {
    return db
      .select({
        id: vaultFiles.id,
        name: vaultFiles.name,
        key: vaultFiles.key,
        size: vaultFiles.size,
        type: vaultFiles.type,
        tags: vaultFiles.tags,
      })
      .from(transactionAttachments)
      .innerJoin(
        vaultFiles,
        eq(transactionAttachments.vaultFileId, vaultFiles.id),
      )
      .where(
        and(
          eq(transactionAttachments.transactionId, transactionId),
          eq(transactionAttachments.workspaceId, workspaceId),
          isNull(vaultFiles.deletedAt),
        ),
      );
  }

  static async syncAttachments(
    transactionId: string,
    workspaceId: string,
    vaultFileIds: string[],
    tx: TransactionConnection = db,
  ) {
    // Soft delete all current attachments for this transaction
    await tx
      .update(transactionAttachments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(transactionAttachments.transactionId, transactionId),
          eq(transactionAttachments.workspaceId, workspaceId),
          isNull(transactionAttachments.deletedAt),
        ),
      );

    // Re-insert the new set
    if (vaultFileIds.length > 0) {
      await tx.insert(transactionAttachments).values(
        vaultFileIds.map((vaultFileId) => ({
          transactionId,
          workspaceId,
          vaultFileId,
        })),
      );
    }
  }

  static async findDebts(transactionId: string, workspaceId: string) {
    return db
      .select({
        payment: {
          id: debtPayments.id,
          amount: debtPayments.amount,
          createdAt: debtPayments.createdAt,
        },
        debt: {
          id: debts.id,
          description: debts.description,
          type: debts.type,
        },
        contact: {
          id: contacts.id,
          name: contacts.name,
        },
      })
      .from(debtPayments)
      .innerJoin(debts, eq(debtPayments.debtId, debts.id))
      .leftJoin(contacts, eq(debts.contactId, contacts.id))
      .where(
        and(
          eq(debtPayments.transactionId, transactionId),
          eq(debtPayments.workspaceId, workspaceId),
          isNull(debtPayments.deletedAt),
        ),
      );
  }

  static async lockForUpdate(
    workspace_id: string,
    id: string,
    tx: TransactionConnection,
  ): Promise<void> {
    await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.workspaceId, workspace_id),
          isNull(transactions.deletedAt),
        ),
      )
      .for("update");
  }

  static async runTransaction<T>(
    callback: (tx: any) => Promise<T>,
  ): Promise<T> {
    return db.transaction(callback);
  }

  /** Existing transactions that might match incoming import rows — one
   * superset query over every wallet + the whole date window the batch
   * spans, matched in memory by the review service (not a per-row query). */
  static async findPotentialDuplicates(
    workspaceId: string,
    walletIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<
    {
      id: string;
      walletId: string;
      toWalletId: string | null;
      amount: string;
      type: string;
      date: string;
      name: string | null;
    }[]
  > {
    if (walletIds.length === 0) return [];

    return db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        toWalletId: transactions.toWalletId,
        amount: transactions.amount,
        type: transactions.type,
        date: transactions.date,
        name: transactions.name,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          inArray(transactions.walletId, walletIds),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
          isNull(transactions.deletedAt),
        ),
      );
  }
}
