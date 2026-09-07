package tasks

import (
	"context"
	"testing"

	"github.com/oewang/worker/internal/aiclient"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractLeadingJSON_ValidObject(t *testing.T) {
	got := extractLeadingJSON(`{"type":"expense","amount":50000}` + " remaining text")
	require.NotNil(t, got)
	assert.Equal(t, "expense", got.Payload["type"])
	assert.Equal(t, "remaining text", got.Remaining)
}

func TestExtractLeadingJSON_NestedBracesAndEscapedQuotes(t *testing.T) {
	got := extractLeadingJSON(`{"name":"say \"hi\"","nested":{"a":1}}` + "tail")
	require.NotNil(t, got)
	assert.Equal(t, `say "hi"`, got.Payload["name"])
	assert.Equal(t, "tail", got.Remaining)
}

func TestExtractLeadingJSON_NoLeadingBrace(t *testing.T) {
	assert.Nil(t, extractLeadingJSON("plain text reply"))
}

func TestExtractLeadingJSON_UnbalancedBraces(t *testing.T) {
	assert.Nil(t, extractLeadingJSON(`{"a": {"b": 1}`))
}

func TestExtractLeadingJSON_InvalidJSON(t *testing.T) {
	assert.Nil(t, extractLeadingJSON(`{not valid json}`))
}

func TestIsTransactionDraftPayload(t *testing.T) {
	cases := []struct {
		name    string
		payload map[string]any
		want    bool
	}{
		{"valid expense", map[string]any{"type": "expense", "amount": 50000.0, "walletId": "w1", "name": "coffee"}, true},
		{"valid income", map[string]any{"type": "income", "amount": 1.0, "walletId": "w1", "name": "salary"}, true},
		{"invalid type", map[string]any{"type": "bogus", "amount": 50000.0, "walletId": "w1", "name": "coffee"}, false},
		{"zero amount", map[string]any{"type": "expense", "amount": 0.0, "walletId": "w1", "name": "coffee"}, false},
		{"negative amount", map[string]any{"type": "expense", "amount": -5.0, "walletId": "w1", "name": "coffee"}, false},
		{"missing wallet", map[string]any{"type": "expense", "amount": 50000.0, "name": "coffee"}, false},
		{"empty name", map[string]any{"type": "expense", "amount": 50000.0, "walletId": "w1", "name": ""}, false},
		{"already a tool result (success)", map[string]any{"success": true, "type": "expense", "amount": 1.0, "walletId": "w1", "name": "x"}, false},
		{"already a tool result (error)", map[string]any{"error": "boom"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, isTransactionDraftPayload(tc.payload))
		})
	}
}

func TestFormatIndonesianThousands(t *testing.T) {
	cases := []struct {
		in   float64
		want string
	}{
		{0, "0"},
		{500, "500"},
		{1000, "1.000"},
		{50000, "50.000"},
		{1234567, "1.234.567"},
		{-1234567, "-1.234.567"},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.want, formatIndonesianThousands(tc.in))
	}
}

func TestNormalizeAiReplyForChat_PlainText(t *testing.T) {
	h := &TelegramWebhookHandler{}
	got := h.normalizeAiReplyForChat(context.Background(), "  just a plain reply  ", "ws-1", "user-1")
	assert.Equal(t, "just a plain reply", got)
}

func TestNormalizeAiReplyForChat_NonDraftJSON(t *testing.T) {
	h := &TelegramWebhookHandler{}
	got := h.normalizeAiReplyForChat(context.Background(), `{"foo":"bar"} some remaining text`, "ws-1", "user-1")
	assert.Equal(t, "some remaining text", got)
}

func TestNormalizeAiReplyForChat_SuccessfulTransaction(t *testing.T) {
	ai := &fakeAI{toolResult: aiclient.ToolExecuteResult{"success": true, "dryRun": false}}
	h := &TelegramWebhookHandler{AI: ai}
	reply := `{"type":"expense","amount":150000,"walletId":"Cash","name":"Coffee"}`
	got := h.normalizeAiReplyForChat(context.Background(), reply, "ws-1", "user-1")
	assert.Equal(t, "✅ Sudah dicatat: Coffee Rp150.000 dari Cash.", got)
}

func TestNormalizeAiReplyForChat_DryRun(t *testing.T) {
	ai := &fakeAI{toolResult: aiclient.ToolExecuteResult{"success": true, "dryRun": true}}
	h := &TelegramWebhookHandler{AI: ai}
	reply := `{"type":"expense","amount":150000,"walletId":"Cash","name":"Coffee"} preview text`
	got := h.normalizeAiReplyForChat(context.Background(), reply, "ws-1", "user-1")
	assert.Contains(t, got, "preview text")
	assert.Contains(t, got, "dry-run aktif")
}

func TestNormalizeAiReplyForChat_ToolFailure(t *testing.T) {
	ai := &fakeAI{toolResult: aiclient.ToolExecuteResult{"success": false, "error": "insufficient balance"}}
	h := &TelegramWebhookHandler{AI: ai}
	reply := `{"type":"expense","amount":150000,"walletId":"Cash","name":"Coffee"}`
	got := h.normalizeAiReplyForChat(context.Background(), reply, "ws-1", "user-1")
	assert.Contains(t, got, "Gagal menyimpan transaksi")
	assert.Contains(t, got, "insufficient balance")
}
