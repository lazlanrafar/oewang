// Package apiclient is a small shared HTTP client for calling apps/api's and
// apps/ai's internal endpoints. It exists so every task handler doesn't
// reimplement the same "x-api-key + timeout + one retry on 5xx" logic.
package apiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// DefaultTimeout is applied per HTTP attempt (not across retries).
const DefaultTimeout = 15 * time.Second

// Client wraps http.Client with the retry/timeout/auth-header behavior
// every internal call needs.
type Client struct {
	HTTPClient *http.Client
}

// New returns a Client configured with DefaultTimeout.
func New() *Client {
	return &Client{HTTPClient: &http.Client{Timeout: DefaultTimeout}}
}

// Post JSON-encodes body (nil is allowed) and POSTs it to baseURL+path,
// setting Content-Type: application/json and x-api-key: apiKey. It retries
// exactly once on a 5xx response or a client-side timeout/transport error;
// it never retries on a 4xx response. Any non-2xx final response, or a
// failed request after the retry, is returned as an error so the asynq
// task handler calling this can propagate it and asynq can retry the task.
func (c *Client) Post(ctx context.Context, baseURL, path, apiKey string, body any) error {
	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("apiclient: encode request body: %w", err)
		}
		payload = encoded
	}

	url := baseURL + path

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		err := c.doPost(ctx, url, apiKey, payload)
		if err == nil {
			return nil
		}
		lastErr = err

		var retryable *retryableError
		if !asRetryable(err, &retryable) {
			// 4xx or other non-retryable failure: stop immediately.
			return err
		}
		// else: retryable (5xx or transport/timeout error) — loop once more.
	}
	return lastErr
}

// retryableError marks an error as eligible for one retry (5xx or
// transport/timeout failures). Anything else (e.g. a 4xx) is returned
// as a plain error and Post will not retry it.
type retryableError struct {
	err error
}

func (e *retryableError) Error() string { return e.err.Error() }
func (e *retryableError) Unwrap() error { return e.err }

func asRetryable(err error, target **retryableError) bool {
	re, ok := err.(*retryableError)
	if ok {
		*target = re
	}
	return ok
}

func (c *Client) doPost(ctx context.Context, url, apiKey string, payload []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("apiclient: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		// Transport-level failure (includes client timeout) — retryable.
		return &retryableError{err: fmt.Errorf("apiclient: request to %s failed: %w", url, err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	baseErr := fmt.Errorf("apiclient: %s returned status %d: %s", url, resp.StatusCode, string(respBody))

	if resp.StatusCode >= 500 {
		return &retryableError{err: baseErr}
	}
	return baseErr
}
