import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Transaction } from "@workspace/types";
import { WalletsRepository } from "../../wallets/wallets.repository";
import { TransactionsRepository } from "../transactions.repository";

const row = {
  id: "client-id",
  workspaceId: "ws",
  walletId: "wallet",
  amount: "10",
  type: "expense",
  date: "2026-01-01",
};
function connection(inserted: object[], existing: object[] = []) {
  const values = mock(() => ({
    onConflictDoNothing: () => ({ returning: async () => inserted }),
  }));
  const where = mock(async (_predicate: SQL) => existing);
  return {
    values,
    where,
    tx: {
      insert: () => ({ values }),
      select: () => ({ from: () => ({ where }) }),
    },
  };
}

afterEach(() => mock.restore());
describe("offline transaction repository idempotency", () => {
  it("should return the new row when the supplied id was inserted", async () => {
    const { tx } = connection([row]);
    const result = await TransactionsRepository.createIdempotent(row, tx);
    expect(result.inserted).toBe(true);
    expect(result.transaction.id).toBe(row.id);
  });
  it("should preserve server id generation when no client id is supplied", async () => {
    const { tx, values } = connection([{ ...row, id: "generated-id" }]);
    const { id: _id, ...input } = row;
    const result = await TransactionsRepository.createIdempotent(input, tx);
    expect(values).toHaveBeenCalledWith(input);
    expect(result.transaction.id).toBe("generated-id");
  });
  it("should read a replay within its workspace and transaction connection", async () => {
    const { tx } = connection([]);
    const read = spyOn(TransactionsRepository, "findById").mockResolvedValue(
      row as Transaction,
    );
    expect(
      (await TransactionsRepository.createIdempotent(row, tx)).inserted,
    ).toBe(false);
    expect(read).toHaveBeenCalledWith("ws", row.id, tx);
  });
  it("should reject an unavailable id when the replay cannot resolve a live tenant row", async () => {
    const { tx } = connection([]);
    spyOn(TransactionsRepository, "findById").mockResolvedValue(undefined);
    await expect(
      TransactionsRepository.createIdempotent(row, tx),
    ).rejects.toThrow();
  });
  it("should scope bulk replay lookup to live rows in the workspace", async () => {
    const { tx, where } = connection([], [row]);
    const result = await TransactionsRepository.createMany([row], tx);
    const predicate = where.mock.calls[0]?.[0];
    if (!predicate) throw new Error("Missing scope predicate");
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"workspace_id"');
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.params).toContain("ws");
    expect(result[0]?.inserted).toBe(false);
  });
  it("should reject the batch when an id belongs to another tenant or deleted record", async () => {
    const { tx } = connection([], []);
    await expect(TransactionsRepository.createMany([row], tx)).rejects.toThrow(
      "unavailable",
    );
  });
  it("should reject a missing wallet when applying a transaction balance delta", async () => {
    const tx = {
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    };
    await expect(
      WalletsRepository.updateBalance("missing", "ws", -10, tx),
    ).rejects.toThrow("Wallet not found in workspace");
  });
});
