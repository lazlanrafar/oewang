import { expect, it, test, describe, mock, beforeEach } from "bun:test";
import { Elysia } from "elysia";

// --- 1. SHARED INFRASTRUCTURE MOCKS ---

mock.module("@workspace/constants", () => ({
  Env: {
    JWT_SECRET: "test-secret-12345678901234567890123456789012",
    JWT_EXPIRES_IN: "7d",
    ENCRYPTION_KEY: "test-key-12345678901234567890123456789012",
    APP_URL: "http://localhost:3000",
    API_BASE_URL: "http://localhost:3000",
    XENDIT_SECRET_KEY: "xnd_sk_123",
    XENDIT_CALLBACK_TOKEN: "whsec_123",
    R2_ENDPOINT: "http://localhost:4566",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "test",
  },
  DEFAULT_INCOME_CATEGORIES: [],
  DEFAULT_EXPENSE_CATEGORIES: [],
  DEFAULT_WALLET_GROUPS: [],
  DEFAULT_WALLETS: [],
  roles: { owner: "owner", admin: "admin", member: "member" },
}));

mock.module("@workspace/encryption", () => ({
  encrypt: mock((val: any) => val),
  decrypt: mock((val: any) => val),
}));

mock.module("@workspace/utils", () => ({
  buildSuccess: mock((data: any, message: string, code?: string) => ({ success: true, data, message, code })),
  buildError: mock((code: string, message: string) => ({ success: false, code, message })),
  buildPaginatedSuccess: mock((data: any, pagination: any, message: string) => ({ success: true, data, pagination, message })),
  buildPagination: mock((total: number, page: number, limit: number) => ({ total, page, limit, totalPages: Math.ceil(total / limit) })),
  buildApiResponse: mock((res: any) => res),
  generateSlug: mock((name: string) => name.toLowerCase().replace(/ /g, "-")),
  parsePaginationQuery: mock(() => ({ limit: 10, offset: 0, page: 1 })),
}));

mock.module("@workspace/supabase/admin", () => ({
  createClient: () => ({
    auth: {
      getUser: mock(() => Promise.resolve({
        data: { user: { id: "u1", email: "test@example.com", app_metadata: {} } },
        error: null
      })),
    },
    storage: {
      from: () => ({
        createSignedUrl: mock(() => Promise.resolve({ data: { signedUrl: "http://signed.url" }, error: null })),
        remove: mock(() => Promise.resolve({ data: {}, error: null })),
      }),
    },
  }),
}));

mock.module("@workspace/currencyfreaks", () => ({
  getExchangeRates: mock(() => Promise.resolve({ success: true, rates: { USD: 1, EUR: 0.9 } })),
  getRates: mock(() => Promise.resolve({ success: true, rates: { USD: 1, EUR: 0.9 } })),
  convertCurrency: mock(() => Promise.resolve(100)),
}));

// --- 2. REPOSITORY & SERVICE MOCKS ---

const mockAuditLogsService = { log: mock(() => Promise.resolve()) };
const mockWorkspacesRepository = {
  create: mock(() => Promise.resolve({ id: "w1", name: "New WS", slug: "new-ws" })),
  getMemberWorkspaces: mock(() => Promise.resolve([{ id: "w1", name: "WS1" }])),
  findById: mock(() => Promise.resolve({ id: "w1", name: "WS1" })),
  getMembership: mock(() => Promise.resolve({ role: "owner" })),
  addMember: mock(() => Promise.resolve()),
  getMemberships: mock(() => Promise.resolve([{ workspace_id: "w1" }])),
  getWorkspaceId: mock(() => Promise.resolve("w1")),
  getWorkspacesWithPlans: mock(() => Promise.resolve([])),
  findPendingInvitationsByEmail: mock(() => Promise.resolve([])),
  acceptInvitation: mock(() => Promise.resolve("w1")),
  findInvitationByToken: mock(() => Promise.resolve(null)),
  updateInvitationStatus: mock(() => Promise.resolve()),
};
const mockCategoriesRepository = {
  findMany: mock(() => Promise.resolve([])),
  findById: mock(() => Promise.resolve({ id: "c1", name: "Food" })),
  create: mock((data: any) => Promise.resolve({ id: "c1", ...data })),
  update: mock((id: string, wsId: string, data: any) => Promise.resolve({ id, ...data })),
  delete: mock(() => Promise.resolve()),
  reorder: mock(() => Promise.resolve()),
  createMany: mock(() => Promise.resolve([])),
};
const mockTransactionsRepository = {
  create: mock((data: any) => Promise.resolve({ id: "t1", ...data })),
  list: mock(() => Promise.resolve({ data: [], total: 0 })),
  findById: mock(() => Promise.resolve({ id: "t1", amount: "100", type: "expense", walletId: "w1" })),
  delete: mock(() => Promise.resolve()),
  syncAttachments: mock(() => Promise.resolve()),
};
const mockWalletsRepository = {
  findMany: mock(() => Promise.resolve({ rows: [], total: 0 })),
  create: mock((data: any) => Promise.resolve({ id: "w1", ...data })),
  createMany: mock(() => Promise.resolve([])),
  updateBalance: mock(() => Promise.resolve()),
};
const mockWalletGroupsRepository = {
  findMany: mock(() => Promise.resolve([])),
  createMany: mock(() => Promise.resolve([])),
};
const mockContactsRepository = {
  findAll: mock(() => Promise.resolve([])),
  findByName: mock(() => Promise.resolve(null)),
  findById: mock(() => Promise.resolve({ id: "con1", name: "John" })),
  create: mock((data: any) => Promise.resolve({ id: "con1", ...data })),
};
const mockDebtsRepository = {
  findAll: mock(() => Promise.resolve([])),
  create: mock((data: any) => Promise.resolve({ id: "d1", ...data })),
};
const mockInvoicesRepository = {
  findAll: mock(() => Promise.resolve([])),
  create: mock((data: any) => Promise.resolve({ id: "inv1", ...data })),
  findByToken: mock(() => Promise.resolve({ id: "inv1", status: "unpaid" })),
};
const mockVaultRepository = {
  findAll: mock(() => Promise.resolve([])),
  findMany: mock(() => Promise.resolve([])),
  count: mock(() => Promise.resolve(0)),
  findById: mock(() => Promise.resolve({ id: "v1", key: "path", size: 100 })),
  delete: mock(() => Promise.resolve()),
  getUsageAndQuota: mock(() => Promise.resolve({ used: 0, maxMb: 100 })),
  getWorkspaceSettings: mock(() => Promise.resolve(null)),
  updateVaultSize: mock(() => Promise.resolve()),
};
const mockOrdersRepository = {
  findAll: mock(() => Promise.resolve({ rows: [{ id: "o1" }], total: 1 })),
  create: mock((data: any) => Promise.resolve({ id: "o1", ...data })),
  findById: mock((id: string) => Promise.resolve({ id, status: "paid" })),
  findByInvoiceId: mock(() => Promise.resolve(null)),
};
const mockUsersRepository = {
  getWorkspaceId: mock(() => Promise.resolve(null)),
  setWorkspaceId: mock(() => Promise.resolve()),
  findByEmail: mock(() => Promise.resolve(null)),
  findById: mock((id: string) => Promise.resolve({ id, email: "test@example.com", name: "User", workspace_id: "w1" })),
  getWorkspacesWithRole: mock(() => Promise.resolve([{ id: "w1", name: "WS1", role: "owner" }])),
  getMemberships: mock(() => Promise.resolve([{ workspace_id: "w1" }])),
  update: mock(() => Promise.resolve()),
};
const mockSettingsRepository = {
  create: mock(() => Promise.resolve()),
  findTransactionSettings: mock(() => Promise.resolve({ currency: "USD" })),
};
const mockSubCurrenciesRepository = {
  findAll: mock(() => Promise.resolve([])),
};

// Module Mocking
mock.module("../modules/audit-logs/audit-logs.service", () => ({ AuditLogsService: mockAuditLogsService }));
mock.module("../modules/workspaces/workspaces.repository", () => ({ WorkspacesRepository: mockWorkspacesRepository }));
mock.module("../modules/categories/categories.repository", () => ({ CategoriesRepository: mockCategoriesRepository }));
mock.module("../modules/transactions/transactions.repository", () => ({ TransactionsRepository: mockTransactionsRepository }));
mock.module("../modules/wallets/wallets.repository", () => ({ WalletsRepository: mockWalletsRepository }));
mock.module("../modules/wallets/groups/groups.repository", () => ({ WalletGroupsRepository: mockWalletGroupsRepository }));
mock.module("../modules/contacts/contacts.repository", () => ({ ContactsRepository: mockContactsRepository }));
mock.module("../modules/debts/debts.repository", () => ({ DebtsRepository: mockDebtsRepository }));
mock.module("../modules/invoices/invoices.repository", () => ({ InvoicesRepository: mockInvoicesRepository }));
mock.module("../modules/vault/vault.repository", () => ({ VaultRepository: mockVaultRepository }));
mock.module("../modules/orders/orders.repository", () => ({ OrdersRepository: mockOrdersRepository }));
mock.module("../modules/users/users.repository", () => ({ UsersRepository: mockUsersRepository }));
mock.module("../modules/settings/settings.repository", () => ({ SettingsRepository: mockSettingsRepository }));
mock.module("../modules/settings/sub-currencies/sub-currencies.repository", () => ({ SubCurrenciesRepository: mockSubCurrenciesRepository }));

// Mock system-admins controller for order access
mock.module("../modules/system-admins/system-admins.controller", () => ({
  requireAdminAccess: new Elysia({ name: "mock.admin" }).derive(() => ({ isAdmin: true })),
}));

// Mock Xendit Service
const mockXenditService = {
  createCheckoutSession: mock(() => Promise.resolve({ success: true, url: "http://checkout.xendit.co" })),
  handleWebhook: mock(() => Promise.resolve({ success: true })),
  processEvent: mock(() => Promise.resolve({ success: true })),
};
mock.module("../modules/xendit/xendit.service", () => ({ XenditService: mockXenditService }));

// Mock database singleton
mock.module("@workspace/database", () => ({
  db: {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ workspace_id: "w1", user_id: "u1", email: "test@example.com", id: "p1", system_role: "owner" }])),
        })),
        leftJoin: mock(() => ({
          where: mock(() => ({
            limit: mock(() => Promise.resolve([{ id: "u1", system_role: "owner", workspace_id: "w1" }])),
          })),
        })),
      })),
    })),
    transaction: mock(async (cb: any) => await cb({
      insert: () => ({ values: () => ({ returning: () => ({ then: (fn: any) => fn([{ id: "w1", name: "WS", slug: "ws" }]) }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: "1" }])),
      })),
    })),
  },
  eq: mock((a: any, b: any) => ({ a, b })),
  users: { workspace_id: "workspace_id", id: "id", system_role: "system_role" },
  user_workspaces: { user_id: "user_id", workspace_id: "workspace_id" },
  pricing: { id: "id", name: "name" },
}));

// Mock BucketClient for Vault/Users
mock.module("@workspace/bucket", () => ({
  BucketClient: mock(() => ({
    upload: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
    getSignedUrl: mock(() => Promise.resolve("http://signed.url")),
  })),
}));

// --- 3. IMPORTS AND APP SETUP ---

import { WorkspacesService } from "../modules/workspaces/workspaces.service";
import { workspacesController } from "../modules/workspaces/workspaces.controller";
import { CategoriesService } from "../modules/categories/categories.service";
import { categoriesController } from "../modules/categories/categories.controller";
import { TransactionsService } from "../modules/transactions/transactions.service";
import { transactions as transactionsController } from "../modules/transactions/transactions.controller";
import { WalletsService } from "../modules/wallets/wallets.service";
import { walletsController } from "../modules/wallets/wallets.controller";
import { ContactsService } from "../modules/contacts/contacts.service";
import { contactsController } from "../modules/contacts/contacts.controller";
import { DebtsService } from "../modules/debts/debts.service";
import { debtsController } from "../modules/debts/debts.controller";
import { InvoicesService } from "../modules/invoices/invoices.service";
import { invoicesController } from "../modules/invoices/invoices.controller";
import { VaultService } from "../modules/vault/vault.service";
import { vaultController } from "../modules/vault/vault.controller";
import { OrdersService } from "../modules/orders/orders.service";
import { ordersController } from "../modules/orders/orders.controller";
import { UsersService } from "../modules/users/users.service";
import { usersController } from "../modules/users/users.controller";
import { authController } from "../modules/auth/auth.controller";
import { XenditService } from "../modules/xendit/xendit.service";
import { xenditController } from "../modules/xendit/xendit.controller";
import { SettingsService } from "../modules/settings/settings.service";
import { settingsController } from "../modules/settings/settings.controller";
import { RatesService } from "../modules/settings/rates/rates.service";
import { SubCurrenciesService } from "../modules/settings/sub-currencies/sub-currencies.service";

import { encryptionPlugin } from "../plugins/encryption";

const app = new Elysia()
  .use(encryptionPlugin)
  .use(workspacesController)
  .use(categoriesController)
  .use(transactionsController)
  .use(walletsController)
  .use(contactsController)
  .use(debtsController)
  .use(invoicesController)
  .use(vaultController)
  .use(ordersController)
  .use(usersController)
  .use(authController)
  .use(xenditController)
  .use(settingsController);

// --- 4. THE UNIFIED TEST SUITE ---

describe("Unified Production Readiness Suite", () => {
  const headers = { authorization: "Bearer token" };

  beforeEach(() => {
    mock.clearAllMocks();
    // Restore default mock implementations
    mockWorkspacesRepository.create.mockImplementation(() => Promise.resolve({ id: "w1", name: "New WS", slug: "new-ws" }));
    mockWorkspacesRepository.getMemberWorkspaces.mockImplementation(() => Promise.resolve([{ id: "w1", name: "WS1" }]));
    mockOrdersRepository.findAll.mockImplementation(() => Promise.resolve({ rows: [{ id: "o1" }], total: 1 }));
    mockOrdersRepository.findByInvoiceId.mockImplementation(() => Promise.resolve(null));
  });

  const unwrap = async (resp: Response) => {
    const json = await resp.json();
    if (json.data && typeof json.data === "string") {
      try {
        return JSON.parse(json.data);
      } catch (e) {
        return json.data;
      }
    }
    return json.data || json;
  };

  describe("Identity Domain (Auth, Users, Workspaces)", () => {
    it("should exchange token in Auth", async () => {
      const resp = await app.handle(new Request("http://localhost/auth/token", { method: "POST", headers }));
      expect(resp.status).toBe(200);
      const res = await unwrap(resp);
      expect(res.data.token).toBeDefined();
    });

    it("should create workspace", async () => {
      const result = await WorkspacesService.createWorkspace("u1", { name: "Test" });
      expect(result.id).toBe("w1");
    });

    it("should get profile", async () => {
      const result = await UsersService.getProfile("u1");
      expect(result?.user.id).toBe("u1");
    });
  });

  describe("Finance Domain (Wallets, Categories, Transactions, Settings, Xendit)", () => {
    it("should create category", async () => {
      const result = await CategoriesService.createCategory("ws1", "u1", { name: "Food", type: "expense" } as any);
      expect(result.success).toBe(true);
    });

    it("should create transaction", async () => {
      const result = await TransactionsService.create("ws1", "u1", { amount: 100, type: "expense", categoryId: "c1", walletId: "w1", description: "test" } as any);
      expect(result.success).toBe(true);
    });

    it("should get exchange rates", async () => {
      const result = await RatesService.getExchangeRates();
      expect(result.success).toBe(true);
    });

    it("should handle xendit webhook", async () => {
      const resp = await app.handle(new Request("http://localhost/xendit/webhook", { method: "POST", headers: { "x-callback-token": "whsec_123" }, body: JSON.stringify({ event: "invoice.paid" }) }));
      expect(resp.status).toBe(200);
    });
  });

  describe("Business Domain (Contacts, Debts, Invoices, Orders, Vault)", () => {
    it("should create contact", async () => {
      const result = await ContactsService.createContact("ws1", "u1", { name: "John", type: "vendor" } as any);
      expect(result.success).toBe(true);
    });

    it("should create debt", async () => {
      const result = await DebtsService.createDebt("ws1", "u1", { name: "Debt", amount: 100, type: "payable", contactId: "con1" } as any);
      expect(result.success).toBe(true);
    });

    it("should list invoices", async () => {
      const resp = await app.handle(new Request("http://localhost/invoices", { headers }));
      expect(resp.status).toBe(200);
      const res = await unwrap(resp);
      expect(res.success).toBe(true);
    });

    it("should get order details", async () => {
      const result = await OrdersService.getOrderDetails("o1");
      expect(result.success).toBe(true);
    });

    it("should delete vault file", async () => {
      const resp = await app.handle(new Request("http://localhost/vault/v1", { method: "DELETE", headers }));
      expect(resp.status).toBe(200);
      const res = await unwrap(resp);
      expect(res.success).toBe(true);
    });
  });
});
