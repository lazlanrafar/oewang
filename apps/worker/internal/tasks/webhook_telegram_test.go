package tasks

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/repo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- fakes ---

type fakeTelegram struct {
	sent        []string
	edited      []string
	documents   []string
	typingCalls int
	messageID   int64
	fileBytes   []byte
	fileErr     error
}

func (f *fakeTelegram) SendMessage(ctx context.Context, chatID string, text string) int64 {
	f.sent = append(f.sent, text)
	return f.messageID
}

func (f *fakeTelegram) EditMessageText(ctx context.Context, chatID string, messageID int64, text string, parseMode string) {
	f.edited = append(f.edited, text)
}

func (f *fakeTelegram) SendDocument(ctx context.Context, chatID, documentURL, caption string) {
	f.documents = append(f.documents, documentURL)
}

func (f *fakeTelegram) StartTyping(ctx context.Context, chatID string) func() {
	f.typingCalls++
	return func() {}
}

func (f *fakeTelegram) DownloadFile(ctx context.Context, fileID string) ([]byte, error) {
	return f.fileBytes, f.fileErr
}

type fakeAI struct {
	draftState        aiclient.DraftState
	handlePendingResp *aiclient.HandlePendingResult
	buildDraftResp    *aiclient.BuildDraftResult
	toolResult        aiclient.ToolExecuteResult
	streamEvents      []aiclient.StreamEvent
	streamErr         error
}

func (f *fakeAI) GetLatestDraftState(ctx context.Context, history []aiclient.DraftMessage) (aiclient.DraftState, error) {
	return f.draftState, nil
}

func (f *fakeAI) HandlePendingInvoiceDraft(ctx context.Context, workspaceID, userID string, message aiclient.DraftMessage, draft aiclient.DraftState, sessionID string) (*aiclient.HandlePendingResult, error) {
	return f.handlePendingResp, nil
}

func (f *fakeAI) BuildInvoiceDraftFromAttachments(ctx context.Context, workspaceID, userID string, attachments []aiclient.Attachment) (*aiclient.BuildDraftResult, error) {
	return f.buildDraftResp, nil
}

func (f *fakeAI) ExecuteTool(ctx context.Context, tool string, input map[string]any, workspaceID, userID string) (aiclient.ToolExecuteResult, error) {
	return f.toolResult, nil
}

func (f *fakeAI) ChatStream(ctx context.Context, message, workspaceID, userID, sessionID string) (<-chan aiclient.StreamEvent, error) {
	if f.streamErr != nil {
		return nil, f.streamErr
	}
	ch := make(chan aiclient.StreamEvent, len(f.streamEvents))
	for _, e := range f.streamEvents {
		ch <- e
	}
	close(ch)
	return ch, nil
}

type fakeIntegrations struct {
	integration       *repo.Integration
	connectCalled     bool
	updatedSettings   map[string]any
	firstMemberID     string
	workspaceIDBySlug string
	isMember          bool
}

func (f *fakeIntegrations) FindByTelegramChatID(ctx context.Context, chatID string) (*repo.Integration, error) {
	return f.integration, nil
}

func (f *fakeIntegrations) ConnectTelegram(ctx context.Context, workspaceID, userID, telegramChatID string) error {
	f.connectCalled = true
	return nil
}

func (f *fakeIntegrations) UpdateSettings(ctx context.Context, id, workspaceID string, settings map[string]any) error {
	f.updatedSettings = settings
	return nil
}

func (f *fakeIntegrations) IsWorkspaceMember(ctx context.Context, workspaceID, userID string) (bool, error) {
	return f.isMember, nil
}

func (f *fakeIntegrations) FindFirstMemberID(ctx context.Context, workspaceID string) (string, error) {
	return f.firstMemberID, nil
}

func (f *fakeIntegrations) FindWorkspaceIDBySlugOrID(ctx context.Context, slugOrID string) (string, error) {
	return f.workspaceIDBySlug, nil
}

type fakeAiSessions struct {
	sessionID string
	messages  []repo.AiMessage
	saved     []string
}

func (f *fakeAiSessions) CreateSession(ctx context.Context, workspaceID, title string) (string, error) {
	return f.sessionID, nil
}

func (f *fakeAiSessions) SaveMessage(ctx context.Context, sessionID, workspaceID, role, content string, attachments any) error {
	f.saved = append(f.saved, content)
	return nil
}

func (f *fakeAiSessions) GetSessionMessages(ctx context.Context, sessionID, workspaceID string) ([]repo.AiMessage, error) {
	return f.messages, nil
}

type fakeNotifications struct {
	created bool
}

func (f *fakeNotifications) Create(ctx context.Context, workspaceID, userID, notifType, title, message, link string) error {
	f.created = true
	return nil
}

func newTask(t *testing.T, rawBody string, updateID int64) *asynq.Task {
	t.Helper()
	task, err := NewTelegramWebhookTask(json.RawMessage(rawBody), updateID)
	require.NoError(t, err)
	return task
}

// --- tests ---

func TestTelegramTaskID_FormatMatchesUpdateID(t *testing.T) {
	assert.Equal(t, "telegram-update-12345", telegramTaskID(12345))
}

func TestNewTelegramWebhookTask_SetsDedupTaskID(t *testing.T) {
	task, err := NewTelegramWebhookTask(json.RawMessage(`{"update_id":42}`), 42)
	require.NoError(t, err)
	assert.Equal(t, "telegram-update-42", telegramTaskID(42))
	assert.Equal(t, TypeTelegramWebhookProcess, task.Type())
}

func TestHandle_NoMessage_NoOp(t *testing.T) {
	h := &TelegramWebhookHandler{Telegram: &fakeTelegram{}}
	task := newTask(t, `{"update_id":1}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)
}

func TestHandle_ConnectCommand_UnknownWorkspace(t *testing.T) {
	tg := &fakeTelegram{}
	ints := &fakeIntegrations{workspaceIDBySlug: ""}
	h := &TelegramWebhookHandler{Telegram: tg, Integrations: ints}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"Connect Oewang myworkspace"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	require.Len(t, tg.sent, 1)
	assert.Contains(t, tg.sent[0], "couldn't find that workspace")
	assert.False(t, ints.connectCalled)
}

func TestHandle_ConnectCommand_Success(t *testing.T) {
	tg := &fakeTelegram{}
	ints := &fakeIntegrations{workspaceIDBySlug: "", firstMemberID: "user-1"}
	// UUID workspace identifier — isUUID(true) branch, skips the slug lookup.
	h := &TelegramWebhookHandler{Telegram: tg, Integrations: ints, Notifications: &fakeNotifications{}}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"Connect Oewang 123e4567-e89b-12d3-a456-426614174000"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	assert.True(t, ints.connectCalled)
	require.Len(t, tg.sent, 1)
	assert.Contains(t, tg.sent[0], "connected to Oewang")
}

func TestHandle_UnknownIntegration_SendsWelcome(t *testing.T) {
	tg := &fakeTelegram{}
	ints := &fakeIntegrations{integration: nil}
	h := &TelegramWebhookHandler{Telegram: tg, Integrations: ints}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"hello"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	require.Len(t, tg.sent, 1)
	assert.Contains(t, tg.sent[0], "Welcome to Oewang")
}

func TestHandle_ReceiptPhoto_BuildsDraftAndReplies(t *testing.T) {
	tg := &fakeTelegram{fileBytes: []byte("fake-image-bytes")}
	ai := &fakeAI{buildDraftResp: &aiclient.BuildDraftResult{Reply: "Detected: Rp50.000 at Starbucks", Draft: map[string]any{"amount": 50000}}}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{}, ConnectedBy: &connectedBy}}
	sessions := &fakeAiSessions{sessionID: "sess-1"}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: sessions}

	body := `{"update_id":1,"message":{"chat":{"id":100},"photo":[{"file_id":"f1"},{"file_id":"f2"}]}}`
	task := newTask(t, body, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	assert.Contains(t, tg.sent, "Detected: Rp50.000 at Starbucks")
	assert.Len(t, sessions.saved, 2) // user "[receipt photo]" + assistant reply
}

func TestHandle_ReceiptPhoto_NoDraftExtracted(t *testing.T) {
	tg := &fakeTelegram{fileBytes: []byte("fake-image-bytes")}
	ai := &fakeAI{buildDraftResp: nil}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{}, ConnectedBy: &connectedBy}}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: &fakeAiSessions{}}

	body := `{"update_id":1,"message":{"chat":{"id":100},"photo":[{"file_id":"f1"}]}}`
	task := newTask(t, body, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	assert.Contains(t, tg.sent, "❌ Sorry, I couldn't extract receipt data from that image.")
}

func TestHandle_TextMessage_DraftConfirmation(t *testing.T) {
	tg := &fakeTelegram{}
	ai := &fakeAI{
		draftState:        map[string]any{"status": "awaiting_confirmation"},
		handlePendingResp: &aiclient.HandlePendingResult{Reply: "Confirmed!", SessionID: "sess-1"},
	}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{"chatSessionId": "sess-1"}, ConnectedBy: &connectedBy}}
	sessions := &fakeAiSessions{messages: []repo.AiMessage{{Role: "user", Content: "50000 groceries"}}}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: sessions}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"yes"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	assert.Contains(t, tg.sent, "Confirmed!")
}

func TestHandle_TextMessage_StreamingChat(t *testing.T) {
	tg := &fakeTelegram{messageID: 555}
	ai := &fakeAI{
		streamEvents: []aiclient.StreamEvent{
			{Event: "content", Data: json.RawMessage(`{"text":"Hello "}`)},
			{Event: "content", Data: json.RawMessage(`{"text":"Hello world"}`)},
			{Event: "done", Data: json.RawMessage(`{"reply":"Hello world","session_id":"sess-2"}`)},
		},
	}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{}, ConnectedBy: &connectedBy}}
	sessions := &fakeAiSessions{}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: sessions}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"how much did I spend?"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	// placeholder "…" sent, then final reply as an edit (messageID != 0).
	require.Len(t, tg.sent, 1)
	assert.Equal(t, "…", tg.sent[0])
	require.NotEmpty(t, tg.edited)
	assert.Equal(t, "Hello world", tg.edited[len(tg.edited)-1])
}

func TestHandle_TextMessage_StreamingChat_ForwardsFileAttachment(t *testing.T) {
	tg := &fakeTelegram{messageID: 555}
	ai := &fakeAI{
		streamEvents: []aiclient.StreamEvent{
			{Event: "content", Data: json.RawMessage(`{"text":"Ini laporannya"}`)},
			{Event: "artifact", Data: json.RawMessage(`{"type":"file-attachment","payload":{"url":"https://r2/export.csv","name":"export.csv"}}`)},
			{Event: "done", Data: json.RawMessage(`{"reply":"Ini laporannya","session_id":"sess-3"}`)},
		},
	}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{}, ConnectedBy: &connectedBy}}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: &fakeAiSessions{}}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"export pengeluaran bulan ini"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err)

	require.Len(t, tg.documents, 1)
	assert.Equal(t, "https://r2/export.csv", tg.documents[0])
}

func TestHandle_TextMessage_StreamError(t *testing.T) {
	tg := &fakeTelegram{messageID: 555}
	ai := &fakeAI{
		streamEvents: []aiclient.StreamEvent{
			{Event: "error", Data: json.RawMessage(`{"error":"sidecar exploded"}`)},
		},
	}
	connectedBy := "user-1"
	ints := &fakeIntegrations{integration: &repo.Integration{ID: "int-1", WorkspaceID: "ws-1", Settings: map[string]any{}, ConnectedBy: &connectedBy}}
	h := &TelegramWebhookHandler{Telegram: tg, AI: ai, Integrations: ints, AiSessions: &fakeAiSessions{}}

	task := newTask(t, `{"update_id":1,"message":{"chat":{"id":100},"text":"hi"}}`, 1)
	err := h.Handle(context.Background(), task)
	require.NoError(t, err) // errors are handled internally, not surfaced to asynq (matches original's swallow-and-reply behavior)

	assert.Contains(t, tg.edited, "❌ Sorry, I encountered an error processing your request.")
}

func TestParseTelegramConnectPayload(t *testing.T) {
	cases := []struct {
		name string
		text string
		want *connectPayload
	}{
		{"start command with workspace", "/start myworkspace", &connectPayload{WorkspaceIdentifier: "myworkspace"}},
		{"start command with workspace+user", "/start myworkspace___user1", &connectPayload{WorkspaceIdentifier: "myworkspace", UserIDCandidate: "user1"}},
		{"legacy phrase", "Connect Oewang myworkspace", &connectPayload{WorkspaceIdentifier: "myworkspace"}},
		{"no match", "hello there", nil},
		{"start with no payload", "/start", nil},
		{"case insensitive phrase", "connect oewang WS1", &connectPayload{WorkspaceIdentifier: "WS1"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseTelegramConnectPayload(tc.text)
			if tc.want == nil {
				assert.Nil(t, got)
				return
			}
			require.NotNil(t, got)
			assert.Equal(t, tc.want.WorkspaceIdentifier, got.WorkspaceIdentifier)
			assert.Equal(t, tc.want.UserIDCandidate, got.UserIDCandidate)
		})
	}
}

func TestIsUUID(t *testing.T) {
	assert.True(t, isUUID("123e4567-e89b-12d3-a456-426614174000"))
	assert.False(t, isUUID("myworkspace"))
	assert.False(t, isUUID(""))
}
