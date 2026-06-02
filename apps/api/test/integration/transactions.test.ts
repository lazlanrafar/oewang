import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createFactories } from "@workspace/database/test/factories";
import { cleanupUser, db, TestClient } from "../helpers";

describe("Transactions API", () => {
  let client: TestClient;
  let factories: ReturnType<typeof createFactories>;
  let userId: string;
  let workspaceId: string;
  let walletId: string;

  beforeEach(async () => {
    factories = createFactories(db);

    // Create test user with workspace
    const { user, workspace } = await factories.users.withWorkspace();
    userId = user.id;
    workspaceId = workspace.id;

    // Create wallet
    const wallet = await factories.wallets(workspaceId).withBalance(1000);
    walletId = wallet.id;

    // TODO: Replace with real authentication once auth endpoint is available
    client = new TestClient();
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  describe("POST /transactions", () => {
    test("creates a transaction successfully", async () => {
      const payload = {
        workspaceId,
        walletId,
        amount: "100.50",
        description: "Test transaction",
        name: "Test",
        type: "expense",
        date: new Date().toISOString(),
      };

      const response = await client.post("/transactions", payload);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toMatchObject({
        amount: "100.50",
        description: "Test transaction",
        type: "expense",
      });
      expect(data.id).toBeDefined();
    });

    test("validates required fields", async () => {
      const response = await client.post("/transactions", {});

      expect(response.status).toBe(400);
    });

    test("validates amount is positive", async () => {
      const payload = {
        workspaceId,
        walletId,
        amount: "-50",
        type: "expense",
        date: new Date().toISOString(),
      };

      const response = await client.post("/transactions", payload);

      expect(response.status).toBe(400);
    });

    test("validates transaction type", async () => {
      const payload = {
        workspaceId,
        walletId,
        amount: "100",
        type: "invalid_type",
        date: new Date().toISOString(),
      };

      const response = await client.post("/transactions", payload);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /transactions", () => {
    beforeEach(async () => {
      // Create test transactions
      const txFactory = factories.transactions(workspaceId, walletId);
      await txFactory.createMany(5);
    });

    test("lists transactions", async () => {
      const response = await client.get("/transactions", {
        query: { workspaceId },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data) || data.data).toBeTruthy();
    });

    test("supports pagination", async () => {
      const response = await client.get("/transactions", {
        query: { workspaceId, limit: "2", offset: "0" },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      const transactions = data.data || data;
      expect(transactions.length).toBeLessThanOrEqual(2);
    });

    test("filters by wallet", async () => {
      const response = await client.get("/transactions", {
        query: { workspaceId, walletId },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      const transactions = data.data || data;
      transactions.forEach((tx: any) => {
        expect(tx.walletId).toBe(walletId);
      });
    });
  });

  describe("GET /transactions/:id", () => {
    test("gets a single transaction", async () => {
      // Create transaction
      const tx = await factories
        .transactions(workspaceId, walletId)
        .expense(100);

      const response = await client.get(`/transactions/${tx.id}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.id).toBe(tx.id);
      expect(data.amount).toBe("100");
    });

    test("returns 404 for non-existent transaction", async () => {
      const response = await client.get("/transactions/non_existent_id");

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /transactions/:id", () => {
    test("updates a transaction", async () => {
      // Create transaction
      const tx = await factories
        .transactions(workspaceId, walletId)
        .expense(100);

      const updates = {
        amount: "200",
        description: "Updated description",
      };

      const response = await client.patch(`/transactions/${tx.id}`, updates);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.amount).toBe("200");
      expect(data.description).toBe("Updated description");
    });

    test("validates update data", async () => {
      const tx = await factories
        .transactions(workspaceId, walletId)
        .expense(100);

      const response = await client.patch(`/transactions/${tx.id}`, {
        amount: "invalid",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /transactions/:id", () => {
    test("deletes a transaction", async () => {
      const tx = await factories
        .transactions(workspaceId, walletId)
        .expense(100);

      const response = await client.delete(`/transactions/${tx.id}`);

      expect(response.ok).toBe(true);

      // Verify it's deleted
      const getResponse = await client.get(`/transactions/${tx.id}`);
      expect(getResponse.status).toBe(404);
    });

    test("returns 404 for non-existent transaction", async () => {
      const response = await client.delete("/transactions/non_existent_id");

      expect(response.status).toBe(404);
    });
  });

  describe("Transaction Statistics", () => {
    beforeEach(async () => {
      // Create mix of income and expenses
      const txFactory = factories.transactions(workspaceId, walletId);
      await txFactory.income(500);
      await txFactory.income(300);
      await txFactory.expense(200);
      await txFactory.expense(150);
    });

    test("calculates total income", async () => {
      const response = await client.get("/transactions/stats", {
        query: { workspaceId, type: "income" },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(parseFloat(data.total)).toBeGreaterThan(0);
    });

    test("calculates total expenses", async () => {
      const response = await client.get("/transactions/stats", {
        query: { workspaceId, type: "expense" },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(parseFloat(data.total)).toBeGreaterThan(0);
    });
  });
});
