// Package telegram is a thin client for the Telegram Bot API, covering only
// the calls apps/worker's Telegram webhook handler needs (send/edit message,
// typing indicator, file download). Ported from apps/api's
// integrations.service.ts, which called these same endpoints inline.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

const apiBase = "https://api.telegram.org"

// Client wraps http.Client with the bot token baked in. All methods swallow
// transport/non-2xx errors internally (log-and-continue) except where noted —
// matching the original TS code's "never let a Telegram API hiccup break the
// whole webhook handler" behavior.
type Client struct {
	Token      string
	HTTPClient *http.Client
}

// New returns a Client with a sane default timeout.
func New(token string) *Client {
	return &Client{Token: token, HTTPClient: &http.Client{Timeout: 15 * time.Second}}
}

type sendMessageResult struct {
	Ok     bool `json:"ok"`
	Result struct {
		MessageID int64 `json:"message_id"`
	} `json:"result"`
}

// SendMessage posts text to chatID with Markdown parse mode, returning the
// sent message's ID (0 if the send failed — callers treat 0 as "no message
// to edit later", same as the TS code treating a nil result as "couldn't
// send").
func (c *Client) SendMessage(ctx context.Context, chatID string, text string) int64 {
	body := map[string]any{"chat_id": chatID, "text": text, "parse_mode": "Markdown"}
	var out sendMessageResult
	if err := c.postJSON(ctx, "sendMessage", body, &out); err != nil {
		log.Printf("telegram: sendMessage failed: %v", err)
		return 0
	}
	if !out.Ok {
		return 0
	}
	return out.Result.MessageID
}

// EditMessageText edits messageID's text. parseMode may be "" (no
// parse_mode sent) or "Markdown". Errors are logged and swallowed — this
// mirrors editTelegramMessage's fire-and-forget behavior in the original TS.
func (c *Client) EditMessageText(ctx context.Context, chatID string, messageID int64, text string, parseMode string) {
	body := map[string]any{"chat_id": chatID, "message_id": messageID, "text": text}
	if parseMode != "" {
		body["parse_mode"] = parseMode
	}
	var out map[string]any
	if err := c.postJSON(ctx, "editMessageText", body, &out); err != nil {
		log.Printf("telegram: editMessageText failed: %v", err)
	}
}

func (c *Client) sendChatAction(ctx context.Context, chatID string, action string) {
	if c.Token == "" {
		return
	}
	body := map[string]any{"chat_id": chatID, "action": action}
	var out map[string]any
	if err := c.postJSON(ctx, "sendChatAction", body, &out); err != nil {
		log.Printf("telegram: sendChatAction failed: %v", err)
	}
}

// StartTyping fires an immediate "typing" chat action, then repeats every
// 4s until the returned stop func is called. stop is safe to call more than
// once (the original TS calls it once on first streamed content and again
// unconditionally in a finally block).
func (c *Client) StartTyping(ctx context.Context, chatID string) (stop func()) {
	c.sendChatAction(ctx, chatID, "typing")

	ticker := time.NewTicker(4 * time.Second)
	done := make(chan struct{})
	var once sync.Once

	go func() {
		for {
			select {
			case <-ticker.C:
				c.sendChatAction(ctx, chatID, "typing")
			case <-done:
				return
			}
		}
	}()

	return func() {
		once.Do(func() {
			ticker.Stop()
			close(done)
		})
	}
}

type getFileResult struct {
	Ok     bool `json:"ok"`
	Result struct {
		FilePath string `json:"file_path"`
	} `json:"result"`
}

// DownloadFile resolves fileID to a file_path via getFile, then downloads
// the raw bytes. Returns (nil, nil) if Telegram reports !ok or an empty
// file_path — the original TS silently no-ops in that case.
func (c *Client) DownloadFile(ctx context.Context, fileID string) ([]byte, error) {
	getFileURL := fmt.Sprintf("%s/bot%s/getFile?file_id=%s", apiBase, c.Token, fileID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, getFileURL, nil)
	if err != nil {
		return nil, fmt.Errorf("telegram: build getFile request: %w", err)
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("telegram: getFile request failed: %w", err)
	}
	defer resp.Body.Close()

	var gf getFileResult
	if err := json.NewDecoder(resp.Body).Decode(&gf); err != nil {
		return nil, fmt.Errorf("telegram: decode getFile response: %w", err)
	}
	if !gf.Ok || gf.Result.FilePath == "" {
		return nil, nil
	}

	downloadURL := fmt.Sprintf("%s/file/bot%s/%s", apiBase, c.Token, gf.Result.FilePath)
	dreq, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("telegram: build download request: %w", err)
	}
	dresp, err := c.HTTPClient.Do(dreq)
	if err != nil {
		return nil, fmt.Errorf("telegram: download media request failed: %w", err)
	}
	defer dresp.Body.Close()
	if dresp.StatusCode < 200 || dresp.StatusCode >= 300 {
		return nil, fmt.Errorf("telegram: download media failed with status %d", dresp.StatusCode)
	}

	data, err := io.ReadAll(dresp.Body)
	if err != nil {
		return nil, fmt.Errorf("telegram: read media body: %w", err)
	}
	return data, nil
}

func (c *Client) postJSON(ctx context.Context, method string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("telegram: encode %s body: %w", method, err)
	}
	url := fmt.Sprintf("%s/bot%s/%s", apiBase, c.Token, method)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("telegram: build %s request: %w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("telegram: %s request failed: %w", method, err)
	}
	defer resp.Body.Close()

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("telegram: decode %s response: %w", method, err)
	}
	return nil
}
