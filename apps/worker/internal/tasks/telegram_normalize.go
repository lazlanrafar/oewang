package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

// normalizeAiReplyForChat mirrors IntegrationsService.normalizeAiReplyForChat:
// detects a leading transaction-draft JSON object at the start of the AI's
// reply, executes it as a create_transaction tool call, and replaces it with
// a human-readable confirmation/failure message. Ported verbatim (including
// the Indonesian-language reply strings) — this is a user-facing message
// format, not incidental to the port.
func (h *TelegramWebhookHandler) normalizeAiReplyForChat(ctx context.Context, rawReply, workspaceID, userID string) string {
	extracted := extractLeadingJSON(rawReply)
	if extracted == nil {
		return strings.TrimSpace(rawReply)
	}

	if !isTransactionDraftPayload(extracted.Payload) {
		remaining := extracted.Remaining
		if remaining == "" {
			remaining = rawReply
		}
		return strings.TrimSpace(remaining)
	}

	result, err := h.AI.ExecuteTool(ctx, "create_transaction", extracted.Payload, workspaceID, userID)
	if err != nil {
		log.Printf("telegram: execute create_transaction failed: %v", err)
		fallback := extracted.Remaining
		if fallback == "" {
			fallback = "⚠️ Gagal menyimpan transaksi."
		}
		return strings.TrimSpace(fallback)
	}

	success, _ := result["success"].(bool)
	dryRun, _ := result["dryRun"].(bool)

	if success && !dryRun {
		amount, _ := extracted.Payload["amount"].(float64)
		amountStr := formatIndonesianThousands(amount)
		wallet := strings.TrimSpace(stringOrEmpty(extracted.Payload["walletId"]))
		name := strings.TrimSpace(stringOrEmpty(extracted.Payload["name"]))
		if name == "" {
			name = "Transaksi"
		}
		return fmt.Sprintf("✅ Sudah dicatat: %s Rp%s dari %s.", name, amountStr, wallet)
	}

	if success && dryRun {
		fallback := extracted.Remaining
		if fallback == "" {
			fallback = "⚠️ Mode dry-run aktif, transaksi belum disimpan."
		}
		return strings.TrimSpace(fallback + "\n\n⚠️ Mode dry-run aktif, transaksi belum masuk database.")
	}

	errorMessage := ""
	if errStr, _ := result["error"].(string); errStr != "" {
		errorMessage = "\n\n⚠️ Gagal menyimpan transaksi: " + errStr
	}
	fallback := extracted.Remaining
	if fallback == "" {
		fallback = "⚠️ Gagal menyimpan transaksi."
	}
	return strings.TrimSpace(fallback + errorMessage)
}

func stringOrEmpty(v any) string {
	s, _ := v.(string)
	return s
}

type leadingJSON struct {
	Payload   map[string]any
	Remaining string
}

// extractLeadingJSON mirrors extractLeadingJson's brace-matching parser
// exactly: finds one balanced {...} object at the start of text (respecting
// quoted strings and escapes), parses it, and returns the parsed payload
// plus whatever text follows.
func extractLeadingJSON(text string) *leadingJSON {
	source := strings.TrimLeft(text, " \t\r\n")
	if !strings.HasPrefix(source, "{") {
		return nil
	}

	depth := 0
	inString := false
	escaped := false
	endIndex := -1

	runes := []rune(source)
	for i, ch := range runes {
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' {
			escaped = true
			continue
		}
		if ch == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if ch == '{' {
			depth++
		}
		if ch == '}' {
			depth--
			if depth == 0 {
				endIndex = i
				break
			}
		}
	}

	if endIndex < 0 {
		return nil
	}

	jsonChunk := string(runes[:endIndex+1])
	var payload map[string]any
	if err := json.Unmarshal([]byte(jsonChunk), &payload); err != nil {
		return nil
	}
	if payload == nil {
		return nil
	}

	remaining := strings.TrimSpace(string(runes[endIndex+1:]))
	return &leadingJSON{Payload: payload, Remaining: remaining}
}

// isTransactionDraftPayload mirrors isTransactionDraftPayload's field checks.
func isTransactionDraftPayload(payload map[string]any) bool {
	if _, hasSuccess := payload["success"]; hasSuccess {
		return false
	}
	if _, hasData := payload["data"]; hasData {
		return false
	}
	if _, hasError := payload["error"]; hasError {
		return false
	}

	txType, _ := payload["type"].(string)
	if txType != "income" && txType != "expense" && txType != "transfer" {
		return false
	}

	amount, ok := payload["amount"].(float64)
	if !ok || amount <= 0 {
		return false
	}

	walletID, _ := payload["walletId"].(string)
	if strings.TrimSpace(walletID) == "" {
		return false
	}

	name, _ := payload["name"].(string)
	if strings.TrimSpace(name) == "" {
		return false
	}

	return true
}

// formatIndonesianThousands mirrors amount.toLocaleString("id-ID"): groups
// the integer part in 3s from the right using "." as the separator. Go has
// no built-in locale formatter for this, so it's hand-rolled. Matches the
// original's behavior for the plain positive amounts this call site always
// receives (a validated tool-call amount > 0); does not attempt full
// id-ID decimal-formatting semantics beyond that.
func formatIndonesianThousands(amount float64) string {
	whole := int64(amount)
	s := fmt.Sprintf("%d", whole)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}

	var groups []string
	for len(s) > 3 {
		groups = append([]string{s[len(s)-3:]}, groups...)
		s = s[:len(s)-3]
	}
	groups = append([]string{s}, groups...)

	out := strings.Join(groups, ".")
	if neg {
		out = "-" + out
	}
	return out
}
