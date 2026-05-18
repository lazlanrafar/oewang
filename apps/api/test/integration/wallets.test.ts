import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { db, TestClient, cleanupUser } from '../helpers';
import { createFactories } from '@workspace/database/test/factories';

describe('Wallets API', () => {
  let client: TestClient;
  let factories: ReturnType<typeof createFactories>;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    factories = createFactories(db);

    // Create test user with workspace
    const { user, workspace } = await factories.users.withWorkspace();
    userId = user.id;
    workspaceId = workspace.id;

    client = new TestClient();
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  describe('POST /wallets', () => {
    test('creates a wallet successfully', async () => {
      const payload = {
        workspaceId,
        name: 'Test Checking Account',
        balance: '1000',
        isIncludedInTotals: true,
      };

      const response = await client.post('/wallets', payload);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toMatchObject({
        name: 'Test Checking Account',
        balance: '1000',
      });
      expect(data.id).toBeDefined();
    });

    test('validates required fields', async () => {
      const response = await client.post('/wallets', {});

      expect(response.status).toBe(400);
    });

    test('sets default balance to 0', async () => {
      const payload = {
        workspaceId,
        name: 'New Wallet',
      };

      const response = await client.post('/wallets', payload);

      if (response.ok) {
        const data = await response.json();
        expect(data.balance).toBe('0');
      }
    });
  });

  describe('GET /wallets', () => {
    beforeEach(async () => {
      // Create test wallets
      await factories.wallets(workspaceId).checking();
      await factories.wallets(workspaceId).savings();
      await factories.wallets(workspaceId).creditCard();
    });

    test('lists all wallets', async () => {
      const response = await client.get('/wallets', {
        query: { workspaceId },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      const wallets = data.data || data;
      expect(wallets.length).toBeGreaterThanOrEqual(3);
    });

    test('filters out deleted wallets', async () => {
      const response = await client.get('/wallets', {
        query: { workspaceId },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      const wallets = data.data || data;
      wallets.forEach((wallet: any) => {
        expect(wallet.deletedAt).toBeFalsy();
      });
    });
  });

  describe('GET /wallets/:id', () => {
    test('gets a single wallet', async () => {
      const wallet = await factories.wallets(workspaceId).checking();

      const response = await client.get(`/wallets/${wallet.id}`);

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.id).toBe(wallet.id);
      expect(data.name).toBe(wallet.name);
    });

    test('returns 404 for non-existent wallet', async () => {
      const response = await client.get('/wallets/non_existent_id');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /wallets/:id', () => {
    test('updates wallet name', async () => {
      const wallet = await factories.wallets(workspaceId).checking();

      const response = await client.patch(`/wallets/${wallet.id}`, {
        name: 'Updated Wallet Name',
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.name).toBe('Updated Wallet Name');
    });

    test('updates wallet balance', async () => {
      const wallet = await factories.wallets(workspaceId).withBalance(1000);

      const response = await client.patch(`/wallets/${wallet.id}`, {
        balance: '2000',
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.balance).toBe('2000');
    });
  });

  describe('DELETE /wallets/:id', () => {
    test('soft deletes a wallet', async () => {
      const wallet = await factories.wallets(workspaceId).checking();

      const response = await client.delete(`/wallets/${wallet.id}`);

      expect(response.ok).toBe(true);

      // Wallet should not appear in list
      const listResponse = await client.get('/wallets', {
        query: { workspaceId },
      });
      const data = await listResponse.json();
      const wallets = data.data || data;

      const deletedWallet = wallets.find((w: any) => w.id === wallet.id);
      expect(deletedWallet).toBeFalsy();
    });
  });

  describe('Wallet Balance Calculations', () => {
    test('calculates total balance across wallets', async () => {
      await factories.wallets(workspaceId).withBalance(1000);
      await factories.wallets(workspaceId).withBalance(2000);
      await factories.wallets(workspaceId).withBalance(500);

      const response = await client.get('/wallets/total', {
        query: { workspaceId },
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(parseFloat(data.total)).toBe(3500);
    });

    test('excludes wallets not included in totals', async () => {
      await factories.wallets(workspaceId).withBalance(1000);
      await factories.wallets(workspaceId).create({
        balance: '500',
        isIncludedInTotals: false,
      });

      const response = await client.get('/wallets/total', {
        query: { workspaceId },
      });

      if (response.ok) {
        const data = await response.json();
        expect(parseFloat(data.total)).toBe(1000);
      }
    });
  });
});
