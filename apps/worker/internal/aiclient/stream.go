package aiclient

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// StreamEvent is one parsed SSE frame from apps/ai's POST /internal/chat/stream.
// Data holds the raw JSON bytes for the frame's "data:" line(s) — callers
// unmarshal into whatever shape that event name implies (content/done/error
// each carry different fields, per apps/api/modules/integrations/ai-sidecar.ts).
type StreamEvent struct {
	Event string
	Data  json.RawMessage
}

// ChatStream opens POST /internal/chat/stream (the tool-loop chat path, keyed
// by workspace_id/user_id via x-api-key — no JWT) and returns a channel of
// parsed events, closed when the stream ends or ctx is canceled. Do NOT point
// this at /chat/stream: that's the legacy no-tool-loop path and can't call
// create_transaction/etc. A transport/HTTP-status failure surfaces as an
// immediate error return (no channel produced) — matching ai-sidecar.ts's
// chatViaSidecarStream, which throws before yielding anything if the initial
// request itself fails.
func (c *Client) ChatStream(ctx context.Context, message, workspaceID, userID, sessionID string) (<-chan StreamEvent, error) {
	body := map[string]any{"message": message, "workspace_id": workspaceID}
	if userID != "" {
		body["user_id"] = userID
	}
	if sessionID != "" {
		body["session_id"] = sessionID
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("aiclient: encode chat/stream body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/internal/chat/stream", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("aiclient: build chat/stream request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.APIKey)

	// No per-request timeout here: streaming responses can legitimately run
	// long. ctx cancellation (caller-supplied) is the only cutoff.
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("aiclient: chat/stream request failed: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		resp.Body.Close()
		return nil, fmt.Errorf("aiclient: chat/stream returned status %d", resp.StatusCode)
	}

	events := make(chan StreamEvent)
	go func() {
		defer resp.Body.Close()
		defer close(events)

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

		var eventName string
		var dataLines []string

		flush := func() {
			if len(dataLines) == 0 {
				eventName = ""
				dataLines = nil
				return
			}
			name := eventName
			if name == "" {
				name = "message"
			}
			data := strings.Join(dataLines, "\n")
			select {
			case events <- StreamEvent{Event: name, Data: json.RawMessage(data)}:
			case <-ctx.Done():
			}
			eventName = ""
			dataLines = nil
		}

		for scanner.Scan() {
			line := scanner.Text()
			switch {
			case line == "":
				flush()
			case strings.HasPrefix(line, "event:"):
				eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			case strings.HasPrefix(line, "data:"):
				dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
			}
			select {
			case <-ctx.Done():
				return
			default:
			}
		}
		flush() // final frame if stream ends without a trailing blank line
	}()

	return events, nil
}

// StreamContentData is the payload shape for event:"content" frames.
type StreamContentData struct {
	Text string `json:"text"`
}

// StreamDoneData is the payload shape for event:"done" frames.
type StreamDoneData struct {
	Reply     string `json:"reply"`
	SessionID string `json:"session_id"`
}

// StreamArtifactData is the payload shape for event:"artifact" frames — one
// per tool call this turn whose result carries a canvas or file attachment
// (apps/ai's execution/executor.py `_artifact_for`). Only `Type` ==
// "file-attachment" matters to the Telegram handler; other types (the
// analysis canvases) have no Telegram-side rendering and are ignored.
type StreamArtifactData struct {
	Type    string `json:"type"`
	Payload struct {
		URL  string `json:"url"`
		Name string `json:"name"`
	} `json:"payload"`
}

// StreamErrorData is the payload shape for event:"error" frames.
type StreamErrorData struct {
	Error string `json:"error"`
}
