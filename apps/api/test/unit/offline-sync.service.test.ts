import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import type { Transaction } from "@workspace/types";
import { AuditLogsService } from "../../modules/audit-logs/audit-logs.service";
import { BudgetsService } from "../../modules/budgets/budgets.service";
import { ContactsRepository } from "../../modules/contacts/contacts.repository";
import { DebtsRepository } from "../../modules/debts/debts.repository";
import { DebtsService } from "../../modules/debts/debts.service";
import { MetricsService } from "../../modules/metrics/metrics.service";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import { RealtimeService } from "../../modules/realtime/realtime.service";
import { WalletsRepository } from "../../modules/wallets/wallets.repository";
import { WalletsService } from "../../modules/wallets/wallets.service";
import { TransactionsRepository } from "../../modules/transactions/transactions.repository";
import { TransactionsService } from "../../modules/transactions/transactions.service";

const transaction = {
  id: "client-id",
  workspaceId: "ws",
  walletId: "wallet",
  type: "expense",
  amount: "10",
  date: "2026-01-01",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  isReady: false,
  isExported: false,
  deletedAt: null,
} as Transaction;
const input = {
  id: transaction.id,
  walletId: "wallet",
  type: "expense" as const,
  amount: 10,
  date: "2026-01-01",
};
const tx = { marker: "transaction connection" };

describe("offline sync service contract", () => {
  beforeEach(() => {
    spyOn(TransactionsRepository, "runTransaction").mockImplementation(
      async (fn) => fn(tx),
    );
    spyOn(AuditLogsService, "log").mockResolvedValue(undefined);
    spyOn(AuditLogsService, "logMany").mockResolvedValue(undefined);
    spyOn(NotificationsService, "create").mockResolvedValue(
      undefined as unknown as Awaited<
        ReturnType<typeof NotificationsService.create>
      >,
    );
    spyOn(RealtimeService, "notifyValueChange").mockImplementation(() => {});
    spyOn(MetricsService, "invalidateWorkspaceCache").mockResolvedValue(
      undefined,
    );
    spyOn(BudgetsService, "invalidateCurrentMonthCache").mockResolvedValue(
      undefined,
    );
    spyOn(WalletsRepository, "updateBalance").mockResolvedValue(undefined);
  });
  afterEach(() => mock.restore());

  it("should preserve the supplied debt id when creating an offline debt", async () => {
    spyOn(ContactsRepository, "findById").mockResolvedValue({
      id: "contact",
      name: "Friend",
    } as Awaited<ReturnType<typeof ContactsRepository.findById>>);
    const create = spyOn(DebtsRepository, "create").mockResolvedValue({
      inserted: false,
      debt: { id: "debt-id" } as NonNullable<
        Awaited<ReturnType<typeof DebtsRepository.create>>
      >["debt"],
    });
    await DebtsService.createDebt("ws", "user", {
      id: "debt-id",
      contactId: "contact",
      type: "payable",
      amount: 10,
    });
    expect(create.mock.calls[0]?.[0].id).toBe("debt-id");
    expect(AuditLogsService.log).not.toHaveBeenCalled();
    expect(NotificationsService.create).not.toHaveBeenCalled();
  });

  it("should skip wallet side effects when a create is replayed", async () => {
    const create = spyOn(WalletsRepository, "create").mockResolvedValue({
      inserted: false,
      wallet: { id: "wallet" },
    });
    await WalletsService.createWallet("ws", "user", {
      id: "wallet",
      name: "Cash",
    });
    expect(create.mock.calls[0]?.[0].id).toBe("wallet");
    expect(AuditLogsService.log).not.toHaveBeenCalled();
  });

  it("should skip money and audit effects when a transaction create is replayed", async () => {
    spyOn(TransactionsRepository, "createIdempotent").mockResolvedValue({
      transaction,
      inserted: false,
    });
    await TransactionsService.create("ws", "user", input);
    expect(WalletsRepository.updateBalance).not.toHaveBeenCalled();
    expect(AuditLogsService.log).not.toHaveBeenCalled();
  });

  it("should commit the inserted transaction balance and audit together when creating", async () => {
    const insert = spyOn(
      TransactionsRepository,
      "createIdempotent",
    ).mockResolvedValue({ transaction, inserted: true });
    await TransactionsService.create("ws", "user", input);
    expect(insert.mock.calls[0]?.[1]).toBe(tx);
    expect(WalletsRepository.updateBalance).toHaveBeenCalledWith(
      "wallet",
      "ws",
      -10,
      tx,
    );
    expect(AuditLogsService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "transaction.created" }), tx);
  });

  it("should propagate a balance failure through the database transaction when creating", async () => {
    spyOn(TransactionsRepository, "createIdempotent").mockResolvedValue({
      transaction,
      inserted: true,
    });
    spyOn(WalletsRepository, "updateBalance").mockRejectedValue(
      new Error("balance failure"),
    );
    await expect(
      TransactionsService.create("ws", "user", input),
    ).rejects.toThrow("balance failure");
    expect(AuditLogsService.log).not.toHaveBeenCalled();
    expect(RealtimeService.notifyValueChange).not.toHaveBeenCalled();
  });

  it("should count only new rows when a bulk sync mixes inserts and replays", async () => {
    spyOn(TransactionsRepository, "createMany").mockResolvedValue([
      { transaction, inserted: false },
      {
        transaction: { ...transaction, id: "new", amount: "20" },
        inserted: true,
      },
    ]);
    const result = await TransactionsService.bulkCreate("ws", "user", [
      { ...input, amount: "10" },
      { ...input, id: "new", amount: "20" },
    ]);
    expect(result.success).toBe(true);
    expect(WalletsRepository.updateBalance).toHaveBeenCalledTimes(1);
    expect(WalletsRepository.updateBalance).toHaveBeenCalledWith(
      "wallet",
      "ws",
      -20,
      tx,
    );
    expect(AuditLogsService.logMany).toHaveBeenCalledWith(expect.any(Array), tx);
  });

  it("should lock the transaction before reading old balances when replaying an update", async () => {
    const lock = spyOn(
      TransactionsRepository,
      "lockForUpdate",
    ).mockResolvedValue(undefined);
    const read = spyOn(TransactionsRepository, "findById").mockResolvedValue(
      transaction,
    );
    spyOn(TransactionsRepository, "update").mockResolvedValue(transaction);
    await TransactionsService.update("ws", "user", transaction.id, {
      amount: 10,
    });
    expect(lock).toHaveBeenCalledWith("ws", transaction.id, tx);
    expect(read).toHaveBeenCalledWith("ws", transaction.id, tx);
    expect(WalletsRepository.updateBalance).toHaveBeenCalledWith(
      "wallet",
      "ws",
      10,
      tx,
    );
    expect(WalletsRepository.updateBalance).toHaveBeenCalledWith(
      "wallet",
      "ws",
      -10,
      tx,
    );
  });
});
