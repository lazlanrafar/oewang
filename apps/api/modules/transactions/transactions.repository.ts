import {
  db,
  transactions,
  wallets,
  categories,
  transactionAttachments,
  vaultFiles,
  users,
  debtPayments,
  debts,
  contacts,
} from "@workspace/database";
import type { Transaction } from "@workspace/types";
import {
  and,
  desc,
  eq,
  gte,
  lte,
  sql,
  aliasedTable,
  isNull,
  inArray,
  or,
  ilike,
} from "drizzle-orm";

export abstract class TransactionsRepository {
  static async create(
    data: typeof transactions.$inferInsert,
  ): Promise<Transaction> {
    const [transaction] = await db
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

  static async createMany(
    data: (typeof transactions.$inferInsert)[],
  ): Promise<Transaction[]> {
    if (data.length === 0) return [];

    const results = await db.insert(transactions).values(data).returning();

    return results.map(
      (transaction) =>
        ({
          ...transaction,
          date: transaction.date,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          deletedAt: transaction.deletedAt,
        }) as unknown as Transaction,
    );
  }

  static async findById(
    workspaceId: string,
    id: string,
  ): Promise<Transaction | undefined> {
    const fromWallet = aliasedTable(wallets, "fromWallet");
    const toWallet = aliasedTable(wallets, "toWallet");

    const [result] = await db
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
      type?: string;
      walletId?: string;
      categoryId?: string;
      startDate?: string;
      endDate?: string;
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
      filters.push(eq(transactions.type, params.type));
    }
    if (params.walletId) {
      filters.push(eq(transactions.walletId, params.walletId));
    }
    if (params.categoryId) {
      filters.push(eq(transactions.categoryId, params.categoryId));
    }
    if (params.startDate) {
      filters.push(gte(transactions.date, params.startDate));
    }
    if (params.endDate) {
      filters.push(lte(transactions.date, params.endDate));
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

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(...filters));

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
      total: Number(countResult?.count || 0),
    };
  }

  static async update(
    workspaceId: string,
    id: string,
    data: Partial<typeof transactions.$inferInsert>,
  ): Promise<Transaction | undefined> {
    const [transaction] = await db
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
      return this.findById(workspaceId, id);
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
  ) {
    // Delete all current attachments for this transaction
    await db
      .delete(transactionAttachments)
      .where(
        and(
          eq(transactionAttachments.transactionId, transactionId),
          eq(transactionAttachments.workspaceId, workspaceId),
        ),
      );

    // Re-insert the new set
    if (vaultFileIds.length > 0) {
      await db.insert(transactionAttachments).values(
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
}
