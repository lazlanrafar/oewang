package aiclient

import "context"

type conversationKey struct{}
type conversation struct {
	SessionID string
	Caption   string
	Personal  bool
}

// WithConversation carries verified transport context, never model arguments.
func WithConversation(ctx context.Context, sessionID, caption string, personal bool) context.Context {
	return context.WithValue(ctx, conversationKey{}, conversation{sessionID, caption, personal})
}

func addConversation(ctx context.Context, body map[string]any) {
	state, _ := ctx.Value(conversationKey{}).(conversation)
	body["personal_memory"] = state.Personal
	if _, exists := body["session_id"]; !exists && state.SessionID != "" {
		body["session_id"] = state.SessionID
	}
	body["caption"] = state.Caption
}
