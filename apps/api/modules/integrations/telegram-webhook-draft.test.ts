import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Bun's mock.module is global across the run — export every symbol the real
// module has so a sibling test importing the same module doesn't break.
const state = {
  sentMessages: [] as { chatId: string; text: string }[],
  createdSessions: [] as { workspaceId: string; title: string }[],
  savedMessages: [] as {
    sessionId: string;
    workspaceId: string;
    role: string;
    content: string;
    attachments?: unknown;
  }[],
  updatedSettings: [] as { id: string; workspaceId: string; settings: any }[],
  buildDraftCalls: [] as { workspaceId: string; userId: string }[],
  buildDraftResult: null as { reply: string; draft: any } | null,
  latestDraftStateResult: null as any,
  handlePendingCalls: [] as any[],
  handlePendingResult: null as { sessionId: string; reply: string } | null,
  chatViaSidecarCalled: false,
  aiServiceChatCalled: false,
  fetchCalls: [] as string[],
  integrationRow: null as any,
};

mock.module("@workspace/constants", () => ({
  Env: { TELEGRAM_BOT_TOKEN: "test-bot-token", AI_SERVICE_URL: "" },
}));

mock.module("@workspace/logger", () => ({
  createLogger: () => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }),
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

mock.module("../../lib/cache", () => ({
  cacheDel: mock(async () => {}),
  cacheGet: mock(async () => null),
  cacheSet: mock(async () => {}),
  getOrSet: mock(async (_key: string, _ttl: number, fn: () => any) => fn()),
}));

mock.module("../ai/ai.repository", () => ({
  AiRepository: {
    createSession: mock(async (workspaceId: string, title: string) => {
      state.createdSessions.push({ workspaceId, title });
      return { id: "new-session", workspaceId, title };
    }),
    saveMessage: mock(
      async (
        sessionId: string,
        workspaceId: string,
        role: string,
        content: string,
        attachments?: unknown,
      ) => {
        state.savedMessages.push({
          sessionId,
          workspaceId,
          role,
          content,
          attachments,
        });
        return { id: `msg-${state.savedMessages.length}` };
      },
    ),
    getSessionMessages: mock(async () => [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "draft reply",
        attachments: { invoiceDraft: { status: "awaiting_confirmation" } },
      },
    ]),
  },
}));

mock.module("../ai/ai.service", () => ({
  AiService: {
    chat: mock(async () => {
      state.aiServiceChatCalled = true;
      return { sessionId: "s1", reply: "fallback reply" };
    }),
  },
}));

mock.module("../ai/ai-sidecar-client", () => ({
  AiSidecarClient: {
    buildInvoiceDraftFromAttachments: mock(
      async (workspaceId: string, userId: string) => {
        state.buildDraftCalls.push({ workspaceId, userId });
        return state.buildDraftResult;
      },
    ),
    getLatestDraftState: mock(async () => state.latestDraftStateResult),
    handlePendingInvoiceDraft: mock(async (...args: any[]) => {
      state.handlePendingCalls.push(args);
      return state.handlePendingResult;
    }),
    executeTool: mock(async () => ({ result: { success: false } })),
  },
}));

mock.module("../notifications/notifications.service", () => ({
  NotificationsService: { create: mock(async () => {}) },
}));

mock.module("./ai-sidecar", () => ({
  chatViaSidecar: mock(async () => {
    state.chatViaSidecarCalled = true;
    return null;
  }),
}));

mock.module("./integrations.repository", () => ({
  IntegrationsRepository: {
    findByTelegramChatId: mock(async () => state.integrationRow),
    updateSettings: mock(async (id: string, workspaceId: string, settings: any) => {
      state.updatedSettings.push({ id, workspaceId, settings });
    }),
    findWorkspaceIdBySlugOrId: mock(async () => null),
    isWorkspaceMember: mock(async () => false),
    findFirstMemberId: mock(async () => "u1"),
  },
}));

state.integrationRow = {
  id: "integ1",
  workspaceId: "ws1",
  connectedBy: "u1",
  settings: {},
};

function fakeFetch(url: string, _init?: any): Promise<Response> {
  state.fetchCalls.push(url);
  if (url.includes("/getFile")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({ ok: true, result: { file_path: "photos/file_1.jpg" } }),
        { status: 200 },
      ),
    );
  }
  if (url.includes("/file/bot")) {
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  }
  if (url.includes("/sendMessage")) {
    let body: any = {};
    try {
      body = JSON.parse(_init?.body ?? "{}");
    } catch {}
    state.sentMessages.push({ chatId: body.chat_id, text: body.text });
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }
  if (url.includes("/sendChatAction")) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }
  throw new Error(`unexpected fetch in test: ${url}`);
}

const { IntegrationsService } = require("./integrations.service");

describe("IntegrationsService.handleTelegramWebhook — receipt-draft flow", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    state.sentMessages = [];
    state.createdSessions = [];
    state.savedMessages = [];
    state.updatedSettings = [];
    state.buildDraftCalls = [];
    state.buildDraftResult = null;
    state.latestDraftStateResult = null;
    state.handlePendingCalls = [];
    state.handlePendingResult = null;
    state.chatViaSidecarCalled = false;
    state.aiServiceChatCalled = false;
    state.fetchCalls = [];
    state.integrationRow = {
      id: "integ1",
      workspaceId: "ws1",
      connectedBy: "u1",
      settings: {},
    };
    global.fetch = mock(fakeFetch) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("builds a receipt draft from an uploaded photo via AiSidecarClient, creates a session, and replies with the preview", async () => {
    state.buildDraftResult = {
      reply: "I parsed your receipt — please confirm before I save.",
      draft: { status: "awaiting_confirmation", wallets: [], entries: [] },
    };

    const payload = {
      message: {
        chat: { id: 12345 },
        photo: [{ file_id: "small" }, { file_id: "biggest" }],
      },
    };

    const result = await IntegrationsService.handleTelegramWebhook(payload);

    expect(result).toBe("OK");
    // Draft building + vault upload + OCR now happen entirely in apps/ai —
    // Telegram's webhook handler only calls the sidecar client.
    expect(state.buildDraftCalls).toEqual([{ workspaceId: "ws1", userId: "u1" }]);
    // No existing chatSessionId in settings → a new session is created here in TS.
    expect(state.createdSessions).toEqual([
      { workspaceId: "ws1", title: "Telegram Receipt" },
    ]);
    expect(state.savedMessages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(state.savedMessages[1]?.attachments).toEqual({
      invoiceDraft: { status: "awaiting_confirmation", wallets: [], entries: [] },
    });
    expect(state.sentMessages).toEqual([
      { chatId: "12345", text: "I parsed your receipt — please confirm before I save." },
    ]);
    // Normal chat fallback must never run on a receipt turn.
    expect(state.chatViaSidecarCalled).toBe(false);
    expect(state.aiServiceChatCalled).toBe(false);
  });

  it("replies with a fallback message when the sidecar can't parse any receipt", async () => {
    state.buildDraftResult = null;

    const payload = {
      message: { chat: { id: 999 }, photo: [{ file_id: "biggest" }] },
    };

    await IntegrationsService.handleTelegramWebhook(payload);

    expect(state.sentMessages).toEqual([
      {
        chatId: "999",
        text: "❌ Sorry, I couldn't extract receipt data from that image.",
      },
    ]);
    expect(state.createdSessions).toEqual([]);
  });
});

describe("IntegrationsService.handleTelegramWebhook — pending-draft precedence", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    state.sentMessages = [];
    state.latestDraftStateResult = null;
    state.handlePendingCalls = [];
    state.handlePendingResult = null;
    state.chatViaSidecarCalled = false;
    state.aiServiceChatCalled = false;
    state.fetchCalls = [];
    state.integrationRow = {
      id: "integ1",
      workspaceId: "ws1",
      connectedBy: "u1",
      settings: { chatSessionId: "existing-session" },
    };
    global.fetch = mock(fakeFetch) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("lets a pending receipt draft own a plain-text reply before falling back to normal chat", async () => {
    state.latestDraftStateResult = { status: "awaiting_confirmation" };
    state.handlePendingResult = { sessionId: "existing-session", reply: "Saved 1 transaction." };

    const payload = {
      message: { chat: { id: 555 }, text: "confirm" },
    };

    const result = await IntegrationsService.handleTelegramWebhook(payload);

    expect(result).toBe("OK");
    expect(state.handlePendingCalls[0]).toEqual([
      "ws1",
      "u1",
      { role: "user", content: "confirm" },
      { status: "awaiting_confirmation" },
      "existing-session",
    ]);
    expect(state.sentMessages).toEqual([{ chatId: "555", text: "Saved 1 transaction." }]);
    // Precedence: a handled draft turn must skip the normal-chat fallback entirely.
    expect(state.chatViaSidecarCalled).toBe(false);
    expect(state.aiServiceChatCalled).toBe(false);
  });

  it("falls through to normal chat when there is no pending draft", async () => {
    state.latestDraftStateResult = null;

    const payload = {
      message: { chat: { id: 555 }, text: "what's my balance" },
    };

    await IntegrationsService.handleTelegramWebhook(payload);

    expect(state.chatViaSidecarCalled).toBe(true);
    expect(state.handlePendingCalls).toEqual([]);
  });

  it("falls through to normal chat when a draft exists but is not awaiting confirmation", async () => {
    state.latestDraftStateResult = { status: "confirmed" };

    const payload = {
      message: { chat: { id: 555 }, text: "thanks" },
    };

    await IntegrationsService.handleTelegramWebhook(payload);

    expect(state.chatViaSidecarCalled).toBe(true);
    expect(state.handlePendingCalls).toEqual([]);
  });
});
