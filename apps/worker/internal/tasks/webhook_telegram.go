package tasks

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"

	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/repo"
)

// TypeTelegramWebhookProcess is enqueued on demand (not periodic), one per
// incoming Telegram webhook update.
const TypeTelegramWebhookProcess = "webhook:telegram_process"

// TelegramWebhookPayload carries the raw Telegram update body through.
type TelegramWebhookPayload struct {
	RawBody  json.RawMessage `json:"raw_body"`
	UpdateID int64           `json:"update_id"`
}

// telegramTaskID formats the asynq.TaskID used for dedup: asynq rejects a
// duplicate *active* TaskID, so keying on Telegram's own update_id means a
// retried/duplicate webhook delivery can't double-enqueue the same update.
func telegramTaskID(updateID int64) string {
	return fmt.Sprintf("telegram-update-%d", updateID)
}

// NewTelegramWebhookTask builds the task for one Telegram update, along
// with the asynq.TaskID option callers must pass to Client.Enqueue for
// the dedup behavior described above.
func NewTelegramWebhookTask(rawBody json.RawMessage, updateID int64) (*asynq.Task, error) {
	payload, err := json.Marshal(TelegramWebhookPayload{RawBody: rawBody, UpdateID: updateID})
	if err != nil {
		return nil, fmt.Errorf("tasks: encode telegram webhook payload: %w", err)
	}
	return asynq.NewTask(
		TypeTelegramWebhookProcess, payload,
		asynq.TaskID(telegramTaskID(updateID)),
		asynq.Queue("critical"), // webhook processing: high priority, weighted above periodic "default" batch jobs
	), nil
}

// telegramUpdate is the slice of the raw Telegram Update JSON this handler
// reads. Fields it doesn't need are ignored via json.RawMessage/omission.
type telegramUpdate struct {
	Message *telegramMessage `json:"message"`
}

type telegramMessage struct {
	Chat struct {
		ID json.Number `json:"id"`
	} `json:"chat"`
	Text     string              `json:"text"`
	Caption  string              `json:"caption"`
	Photo    []telegramPhotoSize `json:"photo"`
	Document *telegramDocument   `json:"document"`
}

type telegramPhotoSize struct {
	FileID string `json:"file_id"`
}

type telegramDocument struct {
	FileID   string `json:"file_id"`
	MimeType string `json:"mime_type"`
	FileName string `json:"file_name"`
}

// TelegramSender is the narrow Telegram Bot API surface this handler needs.
// Satisfied by *telegram.Client; kept as an interface so tests can inject a
// fake without a live Telegram Bot API.
type TelegramSender interface {
	SendMessage(ctx context.Context, chatID string, text string) int64
	EditMessageText(ctx context.Context, chatID string, messageID int64, text string, parseMode string)
	StartTyping(ctx context.Context, chatID string) (stop func())
	DownloadFile(ctx context.Context, fileID string) ([]byte, error)
}

// AiSidecarClient is the narrow apps/ai surface this handler needs.
// Satisfied by *aiclient.Client; kept as an interface so tests can inject a
// fake without a live apps/ai.
type AiSidecarClient interface {
	GetLatestDraftState(ctx context.Context, history []aiclient.DraftMessage) (aiclient.DraftState, error)
	HandlePendingInvoiceDraft(ctx context.Context, workspaceID, userID string, message aiclient.DraftMessage, draft aiclient.DraftState, sessionID string) (*aiclient.HandlePendingResult, error)
	BuildInvoiceDraftFromAttachments(ctx context.Context, workspaceID, userID string, attachments []aiclient.Attachment) (*aiclient.BuildDraftResult, error)
	ExecuteTool(ctx context.Context, tool string, input map[string]any, workspaceID, userID string) (aiclient.ToolExecuteResult, error)
	ChatStream(ctx context.Context, message, workspaceID, userID, sessionID string) (<-chan aiclient.StreamEvent, error)
}

// IntegrationsStore is the narrow workspace_integrations/user_workspaces/
// workspaces surface this handler needs. Satisfied by *repo.IntegrationsRepo.
type IntegrationsStore interface {
	FindByTelegramChatID(ctx context.Context, chatID string) (*repo.Integration, error)
	ConnectTelegram(ctx context.Context, workspaceID, userID, telegramChatID string) error
	UpdateSettings(ctx context.Context, id, workspaceID string, settings map[string]any) error
	IsWorkspaceMember(ctx context.Context, workspaceID, userID string) (bool, error)
	FindFirstMemberID(ctx context.Context, workspaceID string) (string, error)
	FindWorkspaceIDBySlugOrID(ctx context.Context, slugOrID string) (string, error)
}

// AiSessionsStore is the narrow ai_sessions/ai_messages surface this handler
// needs. Satisfied by *repo.AiRepo.
type AiSessionsStore interface {
	CreateSession(ctx context.Context, workspaceID, title string) (string, error)
	SaveMessage(ctx context.Context, sessionID, workspaceID, role, content string, attachments any) error
	GetSessionMessages(ctx context.Context, sessionID, workspaceID string) ([]repo.AiMessage, error)
}

// NotificationsStore is the narrow notifications surface this handler
// needs. Satisfied by *repo.NotificationsRepo.
type NotificationsStore interface {
	Create(ctx context.Context, workspaceID, userID, notifType, title, message, link string) error
}

// CacheInvalidator is the narrow Redis surface this handler needs, for
// invalidating apps/api's `oewang:integrations:{workspaceId}` cache key
// after a connect. Best-effort: nil is valid (cache just goes stale for up
// to its own 24h TTL).
type CacheInvalidator interface {
	Del(ctx context.Context, key string) error
}

// TelegramWebhookHandler owns the full Telegram webhook state machine —
// workspace-connect command, receipt-attachment draft flow, and streaming
// chat with throttled message edits — ported from apps/api's
// IntegrationsService.handleTelegramWebhook (integrations.service.ts).
// apps/api's own copy of this logic and its /v1/internal/integrations/telegram/process
// route are retired once this ships; the worker now calls apps/ai and
// Postgres directly instead of relaying through apps/api.
type TelegramWebhookHandler struct {
	Telegram      TelegramSender
	AI            AiSidecarClient
	Integrations  IntegrationsStore
	AiSessions    AiSessionsStore
	Notifications NotificationsStore
	Redis         CacheInvalidator // may be nil: cache invalidation is best-effort
}

var (
	connectStartRe  = regexp.MustCompile(`(?i)^/start(?:\s+(.+))?$`)
	connectPhraseRe = regexp.MustCompile(`(?i)^Connect Oewang\s+(.+)$`)
	uuidRe          = regexp.MustCompile(`(?i)^[a-f0-9-]{36}$`)
)

type connectPayload struct {
	WorkspaceIdentifier string
	UserIDCandidate     string // "" if absent
}

// parseTelegramConnectPayload mirrors parseTelegramConnectPayload's exact
// regex/split logic.
func parseTelegramConnectPayload(text string) *connectPayload {
	var group1 string
	if m := connectStartRe.FindStringSubmatch(text); m != nil {
		group1 = m[1]
	} else if m := connectPhraseRe.FindStringSubmatch(text); m != nil {
		group1 = m[1]
	} else {
		return nil
	}

	rawPayload := strings.TrimSpace(group1)
	if rawPayload == "" {
		return nil
	}

	firstToken := strings.Fields(rawPayload)
	if len(firstToken) == 0 || firstToken[0] == "" {
		return nil
	}
	token := firstToken[0]

	decoded, err := decodeURIComponent(token)
	if err != nil {
		decoded = token
	}

	parts := strings.SplitN(decoded, "___", 2)
	workspaceIdentifier := strings.TrimSpace(parts[0])
	if workspaceIdentifier == "" {
		return nil
	}
	var userIDCandidate string
	if len(parts) > 1 {
		userIDCandidate = strings.TrimSpace(parts[1])
	}
	return &connectPayload{WorkspaceIdentifier: workspaceIdentifier, UserIDCandidate: userIDCandidate}
}

// decodeURIComponent approximates JS's decodeURIComponent for the plain
// tokens this payload ever carries (workspace id/slug, possibly "___"-joined
// with a user id) — url.QueryUnescape treats "+" as space like JS's
// decodeURIComponent does not, so this only matters if a "+" ever appears in
// a workspace slug; none do today, but %XX-escapes decode identically.
func decodeURIComponent(s string) (string, error) {
	return unescapePercent(s)
}

func unescapePercent(s string) (string, error) {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) {
			v, err := strconv.ParseUint(s[i+1:i+3], 16, 8)
			if err != nil {
				return "", err
			}
			b.WriteByte(byte(v))
			i += 2
		} else {
			b.WriteByte(s[i])
		}
	}
	return b.String(), nil
}

func isUUID(s string) bool {
	return uuidRe.MatchString(s)
}

// Handle implements asynq.HandlerFunc. Mirrors handleTelegramWebhook's
// control flow exactly — see the port-spec notes in the plan for the
// original TS reference this was ported from.
func (h *TelegramWebhookHandler) Handle(ctx context.Context, t *asynq.Task) error {
	var wrapper TelegramWebhookPayload
	if err := json.Unmarshal(t.Payload(), &wrapper); err != nil {
		return fmt.Errorf("tasks: decode telegram webhook payload: %w", err)
	}

	var update telegramUpdate
	if err := json.Unmarshal(wrapper.RawBody, &update); err != nil {
		return fmt.Errorf("tasks: decode telegram update: %w", err)
	}
	if update.Message == nil {
		return nil // "OK": no message to process
	}
	msg := update.Message

	chatID := msg.Chat.ID.String()
	if chatID == "" {
		return nil
	}
	text := strings.TrimSpace(firstNonEmpty(msg.Text, msg.Caption))
	isReceiptDocument := msg.Document != nil &&
		(strings.HasPrefix(msg.Document.MimeType, "image/") || msg.Document.MimeType == "application/pdf")

	// --- STEP A: connect-command check ---
	if text != "" {
		if cp := parseTelegramConnectPayload(text); cp != nil {
			return h.handleConnect(ctx, chatID, cp)
		}
	}

	// --- STEP B: normal message processing ---
	integration, err := h.Integrations.FindByTelegramChatID(ctx, chatID)
	if err != nil {
		return fmt.Errorf("tasks: find integration by chat id: %w", err)
	}
	if integration == nil {
		h.Telegram.SendMessage(ctx, chatID, "👋 Welcome to Oewang! To connect your account, please use the 'Connect Telegram' button in your Oewang dashboard or type `Connect Oewang <your-workspace-id>`.")
		return nil
	}

	workspaceID := integration.WorkspaceID
	settings := integration.Settings
	if settings == nil {
		settings = map[string]any{}
	}

	userID := ""
	if integration.ConnectedBy != nil {
		userID = *integration.ConnectedBy
	}
	if userID == "" {
		if v, ok := settings["connectedByUserId"].(string); ok {
			userID = v
		}
	}
	if userID == "" || userID == "00000000-0000-0000-0000-000000000000" {
		fallbackID, err := h.Integrations.FindFirstMemberID(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("tasks: find first member: %w", err)
		}
		if fallbackID == "" {
			return nil // "Need a valid user to create transaction" — swallowed, matches original's non-"OK" literal return with no side effect
		}
		userID = fallbackID
	}

	chatSessionID, _ := settings["chatSessionId"].(string)

	persistSessionID := func(sessionID string) {
		newSettings := cloneSettings(settings)
		newSettings["chatSessionId"] = sessionID
		if err := h.Integrations.UpdateSettings(ctx, integration.ID, workspaceID, newSettings); err != nil {
			log.Printf("telegram: persist session id failed: %v", err)
		}
	}

	stopTyping := h.Telegram.StartTyping(ctx, chatID)
	defer stopTyping()

	receiptFile := h.extractReceiptFile(msg, isReceiptDocument)

	if receiptFile != nil {
		if err := h.handleReceiptAttachment(ctx, chatID, workspaceID, userID, chatSessionID, persistSessionID, *receiptFile); err != nil {
			log.Printf("telegram: receipt attachment handling error: %v", err)
		}
	} else if text != "" {
		h.handleTextMessage(ctx, chatID, workspaceID, userID, chatSessionID, persistSessionID, text, stopTyping)
	}

	return nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func cloneSettings(m map[string]any) map[string]any {
	out := make(map[string]any, len(m)+1)
	for k, v := range m {
		out[k] = v
	}
	return out
}

func (h *TelegramWebhookHandler) handleConnect(ctx context.Context, chatID string, cp *connectPayload) error {
	var targetWorkspaceID string
	if isUUID(cp.WorkspaceIdentifier) {
		targetWorkspaceID = cp.WorkspaceIdentifier
	} else {
		id, err := h.Integrations.FindWorkspaceIDBySlugOrID(ctx, cp.WorkspaceIdentifier)
		if err != nil {
			return fmt.Errorf("tasks: find workspace by slug: %w", err)
		}
		targetWorkspaceID = id
	}
	if targetWorkspaceID == "" {
		h.Telegram.SendMessage(ctx, chatID, "❌ I couldn't find that workspace. Please reconnect from your Oewang dashboard.")
		return nil
	}

	targetUserID := ""
	if cp.UserIDCandidate != "" {
		isMember, err := h.Integrations.IsWorkspaceMember(ctx, targetWorkspaceID, cp.UserIDCandidate)
		if err != nil {
			return fmt.Errorf("tasks: check workspace member: %w", err)
		}
		if isMember {
			targetUserID = cp.UserIDCandidate
		}
	}
	if targetUserID == "" {
		fallbackID, err := h.Integrations.FindFirstMemberID(ctx, targetWorkspaceID)
		if err != nil {
			return fmt.Errorf("tasks: find first member for connect: %w", err)
		}
		targetUserID = fallbackID
	}
	if targetUserID == "" {
		h.Telegram.SendMessage(ctx, chatID, "❌ Could not find a valid user to link with this workspace. Please use the link from the Oewang app.")
		return nil
	}

	if err := h.Integrations.ConnectTelegram(ctx, targetWorkspaceID, targetUserID, chatID); err != nil {
		return fmt.Errorf("tasks: connect telegram: %w", err)
	}

	if h.Notifications != nil {
		if err := h.Notifications.Create(ctx, targetWorkspaceID, targetUserID, "integration.connected",
			"Telegram Connected",
			"Telegram has been connected to your workspace. You can now chat with your AI assistant via Telegram.",
			"/apps"); err != nil {
			log.Printf("telegram: notification create failed: %v", err)
		}
	}
	if h.Redis != nil {
		if err := h.Redis.Del(ctx, "oewang:integrations:"+targetWorkspaceID); err != nil {
			log.Printf("telegram: cache invalidation failed: %v", err)
		}
	}

	h.Telegram.SendMessage(ctx, chatID, "✅ Your Telegram is now connected to Oewang! You can now send me your expenses or upload receipts anytime.")
	return nil
}

type receiptFile struct {
	FileID   string
	MimeType string
	FileName string
}

func (h *TelegramWebhookHandler) extractReceiptFile(msg *telegramMessage, isReceiptDocument bool) *receiptFile {
	if len(msg.Photo) > 0 {
		last := msg.Photo[len(msg.Photo)-1]
		return &receiptFile{FileID: last.FileID, MimeType: "image/jpeg", FileName: fmt.Sprintf("receipt-%d.jpg", time.Now().UnixMilli())}
	}
	if isReceiptDocument {
		name := msg.Document.FileName
		if name == "" {
			name = fmt.Sprintf("receipt-%d", time.Now().UnixMilli())
		}
		return &receiptFile{FileID: msg.Document.FileID, MimeType: msg.Document.MimeType, FileName: name}
	}
	return nil
}

func (h *TelegramWebhookHandler) handleReceiptAttachment(
	ctx context.Context, chatID, workspaceID, userID, chatSessionID string,
	persistSessionID func(string), rf receiptFile,
) error {
	data, err := h.Telegram.DownloadFile(ctx, rf.FileID)
	if err != nil {
		return fmt.Errorf("download media from telegram: %w", err)
	}
	if data == nil {
		return nil // getFile reported !ok or no file_path — original TS silently no-ops
	}

	base64Image := base64.StdEncoding.EncodeToString(data)
	attachments := []aiclient.Attachment{{Name: rf.FileName, Type: rf.MimeType, Data: base64Image}}

	preview, err := h.AI.BuildInvoiceDraftFromAttachments(ctx, workspaceID, userID, attachments)
	if err != nil {
		return fmt.Errorf("build invoice draft: %w", err)
	}

	if preview == nil {
		h.Telegram.SendMessage(ctx, chatID, "❌ Sorry, I couldn't extract receipt data from that image.")
		return nil
	}

	sessionID := chatSessionID
	if sessionID == "" {
		newSessionID, err := h.AiSessions.CreateSession(ctx, workspaceID, "Telegram Receipt")
		if err != nil {
			log.Printf("telegram: create session failed: %v", err)
		} else {
			sessionID = newSessionID
			persistSessionID(sessionID)
		}
	}
	if sessionID != "" {
		if err := h.AiSessions.SaveMessage(ctx, sessionID, workspaceID, "user", "[receipt photo]", attachments); err != nil {
			log.Printf("telegram: save user message failed: %v", err)
		}
		if err := h.AiSessions.SaveMessage(ctx, sessionID, workspaceID, "assistant", preview.Reply, map[string]any{"invoiceDraft": preview.Draft}); err != nil {
			log.Printf("telegram: save assistant message failed: %v", err)
		}
	}

	h.Telegram.SendMessage(ctx, chatID, preview.Reply)
	return nil
}

func (h *TelegramWebhookHandler) handleTextMessage(
	ctx context.Context, chatID, workspaceID, userID, chatSessionID string,
	persistSessionID func(string), text string, stopTyping func(),
) {
	handledByDraft := false

	if chatSessionID != "" {
		history, err := h.AiSessions.GetSessionMessages(ctx, chatSessionID, workspaceID)
		if err != nil {
			log.Printf("telegram: get session messages failed: %v", err)
		} else {
			draftHistory := make([]aiclient.DraftMessage, len(history))
			for i, m := range history {
				draftHistory[i] = aiclient.DraftMessage{Role: m.Role, Content: m.Content}
			}
			pendingDraft, err := h.AI.GetLatestDraftState(ctx, draftHistory)
			if err != nil {
				log.Printf("telegram: get latest draft state failed: %v", err)
			} else if pendingDraft != nil {
				if status, _ := pendingDraft["status"].(string); status == "awaiting_confirmation" {
					draftResponse, err := h.AI.HandlePendingInvoiceDraft(ctx, workspaceID, userID,
						aiclient.DraftMessage{Role: "user", Content: text}, pendingDraft, chatSessionID)
					if err != nil {
						log.Printf("telegram: handle pending draft failed: %v", err)
					} else if draftResponse != nil {
						h.Telegram.SendMessage(ctx, chatID, draftResponse.Reply)
						handledByDraft = true
					}
				}
			}
		}
	}

	if handledByDraft {
		return
	}

	h.streamChatReply(ctx, chatID, workspaceID, userID, chatSessionID, persistSessionID, text, stopTyping)
}

const editThrottle = 1300 * time.Millisecond

func (h *TelegramWebhookHandler) streamChatReply(
	ctx context.Context, chatID, workspaceID, userID, chatSessionID string,
	persistSessionID func(string), text string, stopTyping func(),
) {
	messageID := h.Telegram.SendMessage(ctx, chatID, "…")

	sendError := func(err error) {
		log.Printf("telegram: chat stream error: %v", err)
		const errorText = "❌ Sorry, I encountered an error processing your request."
		if messageID != 0 {
			h.Telegram.EditMessageText(ctx, chatID, messageID, errorText, "")
		} else {
			h.Telegram.SendMessage(ctx, chatID, errorText)
		}
	}

	events, err := h.AI.ChatStream(ctx, text, workspaceID, userID, chatSessionID)
	if err != nil {
		sendError(fmt.Errorf("open chat stream: %w", err))
		return
	}

	var (
		buffer          strings.Builder
		lastEditedText  string
		lastEditAt      time.Time
		firstEditLanded bool
		finalReplyText  string
		finalSessionID  string
		streamErr       error
	)

	for evt := range events {
		switch evt.Event {
		case "content":
			var data aiclient.StreamContentData
			if err := json.Unmarshal(evt.Data, &data); err != nil {
				continue
			}
			buffer.WriteString(data.Text)
			now := time.Now()
			dueForEdit := now.Sub(lastEditAt) >= editThrottle
			if messageID != 0 && buffer.String() != lastEditedText && dueForEdit {
				h.Telegram.EditMessageText(ctx, chatID, messageID, buffer.String(), "")
				lastEditedText = buffer.String()
				lastEditAt = now
				if !firstEditLanded {
					firstEditLanded = true
					stopTyping()
				}
			}
		case "done":
			var data aiclient.StreamDoneData
			if err := json.Unmarshal(evt.Data, &data); err == nil {
				finalReplyText = data.Reply
				if finalReplyText == "" {
					finalReplyText = buffer.String()
				}
				finalSessionID = data.SessionID
			}
		case "error":
			var data aiclient.StreamErrorData
			_ = json.Unmarshal(evt.Data, &data)
			if data.Error == "" {
				data.Error = "AI sidecar stream error"
			}
			streamErr = fmt.Errorf("%s", data.Error)
		}
	}

	if streamErr != nil {
		sendError(streamErr)
		return
	}

	if finalSessionID != "" && finalSessionID != chatSessionID {
		persistSessionID(finalSessionID)
	}

	if finalReplyText != "" {
		replyText := h.normalizeAiReplyForChat(ctx, finalReplyText, workspaceID, userID)
		if messageID != 0 {
			h.Telegram.EditMessageText(ctx, chatID, messageID, replyText, "Markdown")
		} else {
			h.Telegram.SendMessage(ctx, chatID, replyText)
		}
	}
}
