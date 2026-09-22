package repo

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/oewang/worker/internal/cuid"
)

// AiMessage mirrors an ai_messages row (only the columns the Telegram
// handler's history/draft-state calls need).
type AiMessage struct {
	Attachments json.RawMessage
	Role        string
	Content     string
}

// AiRepo wraps the pgxpool.Pool for ai_sessions/ai_messages access, ported
// from apps/api/modules/ai/ai.repository.ts's AiRepository.
type AiRepo struct {
	Pool Pool
}

// CreateSession mirrors AiRepository.createSession — inserts a new
// ai_sessions row and returns its id.
func (r *AiRepo) CreateSession(ctx context.Context, workspaceID, title string) (string, error) {
	id := cuid.New()
	const q = `INSERT INTO ai_sessions (id, workspace_id, title) VALUES ($1, $2, $3)`
	if _, err := r.Pool.Exec(ctx, q, id, workspaceID, title); err != nil {
		return "", fmt.Errorf("repo: create ai session: %w", err)
	}
	return id, nil
}

// SaveMessage mirrors AiRepository.saveMessage. attachments may be nil.
func (r *AiRepo) SaveMessage(ctx context.Context, sessionID, workspaceID, role, content string, attachments any) error {
	var raw []byte
	if attachments != nil {
		encoded, err := json.Marshal(attachments)
		if err != nil {
			return fmt.Errorf("repo: marshal ai message attachments: %w", err)
		}
		raw = encoded
	}
	const q = `
		INSERT INTO ai_messages (id, session_id, workspace_id, role, content, attachments)
		VALUES ($1, $2, $3, $4, $5, $6)`
	if _, err := r.Pool.Exec(ctx, q, cuid.New(), sessionID, workspaceID, role, content, raw); err != nil {
		return fmt.Errorf("repo: save ai message: %w", err)
	}
	return nil
}

// GetSessionMessages mirrors AiRepository.getSessionMessages: fetches the
// most recent 20 rows (newest first) then reverses to chronological order —
// callers (draft-state / chat-history) need oldest-first.
func (r *AiRepo) GetSessionMessages(ctx context.Context, sessionID, workspaceID string) ([]AiMessage, error) {
	const q = `
		SELECT role, content, attachments FROM ai_messages
		WHERE session_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM ai_sessions s WHERE s.id = $1 AND s.workspace_id = $2 AND s.user_id IS NULL AND s.deleted_at IS NULL)
		ORDER BY created_at DESC
		LIMIT 20`
	rows, err := r.Pool.Query(ctx, q, sessionID, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("repo: query ai messages: %w", err)
	}
	defer rows.Close()

	var messages []AiMessage
	for rows.Next() {
		var m AiMessage
		if err := rows.Scan(&m.Role, &m.Content, &m.Attachments); err != nil {
			return nil, fmt.Errorf("repo: scan ai message: %w", err)
		}
		messages = append(messages, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repo: iterate ai messages: %w", err)
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

// NotificationsRepo wraps the pgxpool.Pool for the notifications table,
// ported from NotificationsService.create's single insert.
type NotificationsRepo struct {
	Pool Pool
}

// Create mirrors NotificationsService.create — a plain insert, no returning
// value needed by callers here (fire-and-forget, errors logged not
// propagated by the caller).
func (r *NotificationsRepo) Create(ctx context.Context, workspaceID, userID, notifType, title, message, link string) error {
	const q = `
		INSERT INTO notifications (id, user_id, workspace_id, type, title, message, link)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	if _, err := r.Pool.Exec(ctx, q, cuid.New(), userID, workspaceID, notifType, title, message, link); err != nil {
		return fmt.Errorf("repo: create notification: %w", err)
	}
	return nil
}
