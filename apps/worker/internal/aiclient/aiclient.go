// Package aiclient calls apps/ai's internal endpoints directly (x-api-key
// only, same trust model apps/ai already extends to apps/api and apps/app —
// see apps/ai/app/main.py's require_api_key dependency). Ported from
// apps/api/modules/ai/ai-sidecar-client.ts's draft/tool-execute functions,
// covering only what the Telegram webhook handler needs.
package aiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// DefaultTimeout matches ai-sidecar-client.ts's sidecarPost: chat tool-loops
// and OCR are legitimately slow, but a wedged sidecar must not hang forever.
const DefaultTimeout = 120 * time.Second

// Client calls apps/ai's internal HTTP endpoints.
type Client struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

// New returns a Client configured with DefaultTimeout.
func New(baseURL, apiKey string) *Client {
	return &Client{BaseURL: baseURL, APIKey: apiKey, HTTPClient: &http.Client{Timeout: DefaultTimeout}}
}

func (c *Client) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("aiclient: encode %s body: %w", path, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("aiclient: build %s request: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("aiclient: %s request failed: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("aiclient: %s returned status %d", path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("aiclient: decode %s response: %w", path, err)
	}
	return nil
}

// DraftMessage mirrors ai-sidecar-client.ts's {role, content} shape.
type DraftMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Attachment mirrors ChatAttachment: {name, type, data} where data is
// base64-encoded file content, no data-URI prefix.
type Attachment struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Data string `json:"data"`
}

// DraftState is intentionally untyped (map) — the draft payload shape is
// opaque to the worker, it only ever round-trips it back to apps/ai unchanged.
type DraftState = map[string]any

// GetLatestDraftState calls POST /draft/latest-state. Returns nil if no
// draft is pending.
func (c *Client) GetLatestDraftState(ctx context.Context, history []DraftMessage) (DraftState, error) {
	var out struct {
		Draft DraftState `json:"draft"`
	}
	if err := c.post(ctx, "/draft/latest-state", map[string]any{"history": history}, &out); err != nil {
		return nil, err
	}
	return out.Draft, nil
}

// HandlePendingResult mirrors {sessionId, reply} from /draft/handle-pending.
type HandlePendingResult struct {
	SessionID string `json:"sessionId"`
	Reply     string `json:"reply"`
}

// HandlePendingInvoiceDraft calls POST /draft/handle-pending. Returns nil if
// apps/ai reports no result (e.g. the draft was already resolved elsewhere).
func (c *Client) HandlePendingInvoiceDraft(ctx context.Context, workspaceID, userID string, message DraftMessage, draft DraftState, sessionID string) (*HandlePendingResult, error) {
	var out struct {
		Result *HandlePendingResult `json:"result"`
	}
	body := map[string]any{
		"workspace_id": workspaceID,
		"user_id":      userID,
		"message":      message,
		"draft":        draft,
		"session_id":   sessionID,
	}
	if err := c.post(ctx, "/draft/handle-pending", body, &out); err != nil {
		return nil, err
	}
	return out.Result, nil
}

// BuildDraftResult mirrors {reply, draft} from /draft/build-from-attachments.
type BuildDraftResult struct {
	Reply string     `json:"reply"`
	Draft DraftState `json:"draft"`
}

// BuildInvoiceDraftFromAttachments calls POST /draft/build-from-attachments.
// Returns nil if apps/ai couldn't extract anything from the attachment.
func (c *Client) BuildInvoiceDraftFromAttachments(ctx context.Context, workspaceID, userID string, attachments []Attachment) (*BuildDraftResult, error) {
	var out struct {
		Result *BuildDraftResult `json:"result"`
	}
	body := map[string]any{
		"workspace_id": workspaceID,
		"user_id":      userID,
		"attachments":  attachments,
	}
	if err := c.post(ctx, "/draft/build-from-attachments", body, &out); err != nil {
		return nil, err
	}
	return out.Result, nil
}

// ToolExecuteResult is intentionally loosely typed: callers pull specific
// fields (success, dryRun, error) out of the map themselves — matching the
// TS side, which also treats `.result` as an untyped bag of fields.
type ToolExecuteResult = map[string]any

// ExtractedTransaction mirrors SidecarExtractedTransaction from
// ai-sidecar-client.ts.
type ExtractedTransaction struct {
	Name         string  `json:"name"`
	Amount       float64 `json:"amount"`
	Date         string  `json:"date"`
	Type         string  `json:"type"` // "income" | "expense" | "transfer"
	WalletName   *string `json:"walletName"`
	CategoryName *string `json:"categoryName"`
	Description  *string `json:"description"`
}

// ExtractTransactions calls POST /import/extract (apps/ai's
// ImportExtractRequest: {data, mimeType, walletNames, categoryNames,
// workspace_id}), the same endpoint apps/api's AiSidecarClient.extractTransactions
// calls — the worker is now a second direct caller.
func (c *Client) ExtractTransactions(ctx context.Context, base64Data, mimeType string, walletNames, categoryNames []string, workspaceID string) ([]ExtractedTransaction, error) {
	var out struct {
		Transactions []ExtractedTransaction `json:"transactions"`
	}
	body := map[string]any{
		"data":          base64Data,
		"mimeType":      mimeType,
		"walletNames":   walletNames,
		"categoryNames": categoryNames,
		"workspace_id":  workspaceID,
	}
	if err := c.post(ctx, "/import/extract", body, &out); err != nil {
		return nil, err
	}
	return out.Transactions, nil
}

// ExecuteTool calls POST /tools/execute (apps/ai/app/api/routes/capabilities.py's
// ToolExecuteRequest: {tool, input, workspace_id, user_id}).
func (c *Client) ExecuteTool(ctx context.Context, tool string, input map[string]any, workspaceID, userID string) (ToolExecuteResult, error) {
	var out struct {
		Result ToolExecuteResult `json:"result"`
	}
	body := map[string]any{
		"tool":         tool,
		"input":        input,
		"workspace_id": workspaceID,
		"user_id":      userID,
	}
	if err := c.post(ctx, "/tools/execute", body, &out); err != nil {
		return nil, err
	}
	return out.Result, nil
}
