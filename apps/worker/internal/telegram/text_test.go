package telegram

import (
	"context"
	"encoding/json"
	"github.com/stretchr/testify/require"
	"net/http"
	"strings"
	"testing"
	"unicode/utf16"
)

func TestShouldPreserveAllItemsWhenReceiptIsLong(t *testing.T) {
	text := strings.Repeat("• Barang [*]_<> 😀 — 2 × IDR 10.000\n", 400)
	chunks := SplitText(text)
	require.Greater(t, len(chunks), 1)
	require.Equal(t, text, strings.Join(chunks, ""))
	for _, chunk := range chunks {
		require.LessOrEqual(t, len(utf16.Encode([]rune(chunk))), 3500)
		require.True(t, strings.HasSuffix(chunk, "\n"))
	}
}

func TestShouldKeepUnicodeWhenOneItemExceedsMessageLimit(t *testing.T) {
	text := strings.Repeat("😀", 5000)
	parts := SplitText(text)
	require.Equal(t, text, strings.Join(parts, ""))
	for _, part := range parts {
		require.LessOrEqual(t, len(utf16.Encode([]rune(part))), 3500)
	}
}

func TestShouldSendOCRAsLiteralTextWhenSpecialCharactersPresent(t *testing.T) {
	var sent []string
	client, server := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.NotContains(t, body, "parse_mode")
		sent = append(sent, body["text"].(string))
		w.Write([]byte(`{"ok":true,"result":{"message_id":1}}`))
	})
	defer server.Close()
	text := strings.Repeat("• [click](evil) _*special*_: 10.000\n", 300)
	client.SendPlainMessage(context.Background(), "123", text)
	require.Equal(t, text, strings.Join(sent, ""))
}
