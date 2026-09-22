package tasks

import (
	"context"
	"encoding/json"
	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/repo"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

type memoryContractAI struct {
	fakeAI
	client *aiclient.Client
}

func (a *memoryContractAI) BuildInvoiceDraftFromAttachments(ctx context.Context, ws, user string, attachments []aiclient.Attachment) (*aiclient.BuildDraftResult, error) {
	return a.client.BuildInvoiceDraftFromAttachments(ctx, ws, user, attachments)
}

func TestShouldOnlyEnablePersonalMemoryWhenSenderIsVerified(t *testing.T) {
	for _, tc := range []struct {
		name, chatType, sender, linked string
		member, allowed                bool
	}{
		{"verified private", "private", "100", "user-1", true, true},
		{"group", "group", "100", "user-1", true, false},
		{"different sender", "private", "999", "user-1", true, false},
		{"legacy link", "private", "100", "", true, false},
		{"removed membership", "private", "100", "user-1", false, false},
		{"different linked user", "private", "100", "user-2", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var received map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "/draft/build-from-attachments", r.URL.Path)
				require.NoError(t, json.NewDecoder(r.Body).Decode(&received))
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"result":{"reply":"Rincian struk","session_id":"private-session"}}`))
			}))
			defer server.Close()
			user := "user-1"
			integrations := &fakeIntegrations{isMember: tc.member, integration: &repo.Integration{
				ID: "i", WorkspaceID: "w", ConnectedBy: &user, Settings: map[string]any{"personalMemoryUserId": tc.linked, "chatSessionId": "old-session"},
			}}
			h := &TelegramWebhookHandler{Telegram: &fakeTelegram{fileBytes: []byte("photo")}, AI: &memoryContractAI{client: aiclient.New(server.URL, "test")}, Integrations: integrations}
			body := `{"update_id":9,"message":{"chat":{"id":100,"type":"` + tc.chatType + `"},"from":{"id":` + tc.sender + `},"caption":"Tolong baca struk ini","photo":[{"file_id":"file"}]}}`
			require.NoError(t, h.Handle(context.Background(), newTask(t, body, 9)))
			require.Equal(t, tc.allowed, received["personal_memory"])
			require.Equal(t, "Tolong baca struk ini", received["caption"])
			require.Equal(t, "old-session", received["session_id"])
			require.Equal(t, "private-session", integrations.updatedSettings["chatSessionId"])
		})
	}
}
