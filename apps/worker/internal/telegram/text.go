package telegram

import (
	"context"
	"log"
	"strings"
	"unicode/utf16"
)

// SplitText preserves every character and prefers line/item boundaries. Telegram
// counts UTF-16 code units; leave headroom beneath its 4096-character ceiling.
func SplitText(text string) []string {
	const limit = 3500
	var chunks []string
	current := ""
	for _, line := range strings.SplitAfter(text, "\n") {
		if len(utf16.Encode([]rune(current+line))) <= limit {
			current += line
			continue
		}
		if current != "" {
			chunks = append(chunks, current)
			current = ""
		}
		for _, r := range line {
			if len(utf16.Encode([]rune(current+string(r)))) > limit {
				chunks = append(chunks, current)
				current = ""
			}
			current += string(r)
		}
	}
	if current != "" {
		chunks = append(chunks, current)
	}
	return chunks
}

// SendPlainMessage treats OCR as literal text: markup characters cannot change
// formatting, create links, or reject the Telegram request.
func (c *Client) SendPlainMessage(ctx context.Context, chatID, text string) int64 {
	var first int64
	for i, part := range SplitText(text) {
		var out sendMessageResult
		if err := c.postJSON(ctx, "sendMessage", map[string]any{"chat_id": chatID, "text": part}, &out); err != nil {
			log.Printf("telegram: sendMessage (plain, part %d) failed: %v", i, err)
			return 0
		}
		if !out.Ok {
			return 0
		}
		if first == 0 {
			first = out.Result.MessageID
		}
	}
	return first
}
