// Package repo holds the Postgres queries apps/worker's Telegram webhook
// handler needs, ported 1:1 from apps/api/modules/integrations/integrations.repository.ts
// and apps/api/modules/ai/ai.repository.ts. Every insert generates its own
// id via internal/cuid — Postgres never supplies one (see internal/cuid's
// doc comment for why).
package repo

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oewang/worker/internal/cuid"
)

// Integration mirrors a workspace_integrations row (only the columns the
// Telegram handler reads).
type Integration struct {
	ID          string
	WorkspaceID string
	Settings    map[string]any
	ConnectedBy *string
}

// IntegrationsRepo wraps the pgxpool.Pool for workspace_integrations,
// user_workspaces, and workspaces reads/writes.
type IntegrationsRepo struct {
	Pool *pgxpool.Pool
}

func scanSettings(raw []byte) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

// FindByTelegramChatID mirrors integrations.repository.ts's
// findByTelegramChatId: WHERE provider='telegram' AND is_active AND
// deleted_at IS NULL AND settings->>'telegramChatId' = $1.
func (r *IntegrationsRepo) FindByTelegramChatID(ctx context.Context, chatID string) (*Integration, error) {
	const q = `
		SELECT id, workspace_id, settings, connected_by
		FROM workspace_integrations
		WHERE provider = 'telegram' AND is_active = true AND deleted_at IS NULL
		  AND settings ->> 'telegramChatId' = $1
		LIMIT 1`
	var (
		id, workspaceID string
		settingsRaw     []byte
		connectedBy     *string
	)
	err := r.Pool.QueryRow(ctx, q, chatID).Scan(&id, &workspaceID, &settingsRaw, &connectedBy)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &Integration{ID: id, WorkspaceID: workspaceID, Settings: scanSettings(settingsRaw), ConnectedBy: connectedBy}, nil
}

// findByProvider mirrors the upsert's own lookup: no deleted_at filter, so
// a soft-deleted integration row can be resurrected by ConnectTelegram.
func (r *IntegrationsRepo) findByProvider(ctx context.Context, workspaceID, provider string) (id string, found bool, err error) {
	const q = `
		SELECT id FROM workspace_integrations
		WHERE workspace_id = $1 AND provider = $2
		ORDER BY updated_at DESC LIMIT 1`
	err = r.Pool.QueryRow(ctx, q, workspaceID, provider).Scan(&id)
	if err == pgx.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, true, nil
}

// ConnectTelegram mirrors connectTelegram + its inner upsert({workspaceId,
// provider:"telegram", settings:{telegramChatId}, isActive:true,
// connectedBy:userId}) — always the isActive=true branch, so connected_at
// is always set to now.
func (r *IntegrationsRepo) ConnectTelegram(ctx context.Context, workspaceID, userID, telegramChatID string) error {
	settings, err := json.Marshal(map[string]any{"telegramChatId": telegramChatID})
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)

	id, found, err := r.findByProvider(ctx, workspaceID, "telegram")
	if err != nil {
		return err
	}

	if found {
		const q = `
			UPDATE workspace_integrations SET
				settings = $2, is_active = true, connected_at = $3,
				connected_by = $4, deleted_at = NULL, updated_at = $3
			WHERE id = $1`
		_, err = r.Pool.Exec(ctx, q, id, settings, now, userID)
		return err
	}

	const q = `
		INSERT INTO workspace_integrations
			(id, workspace_id, provider, settings, is_active, connected_at, connected_by, created_at, updated_at)
		VALUES ($1, $2, 'telegram', $3, true, $4, $5, $4, $4)`
	_, err = r.Pool.Exec(ctx, q, cuid.New(), workspaceID, settings, now, userID)
	return err
}

// UpdateSettings mirrors integrations.repository.ts's updateSettings.
func (r *IntegrationsRepo) UpdateSettings(ctx context.Context, id, workspaceID string, settings map[string]any) error {
	raw, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	const q = `
		UPDATE workspace_integrations SET settings = $3, updated_at = $4
		WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`
	_, err = r.Pool.Exec(ctx, q, id, workspaceID, raw, now)
	return err
}

// IsWorkspaceMember mirrors isWorkspaceMember.
func (r *IntegrationsRepo) IsWorkspaceMember(ctx context.Context, workspaceID, userID string) (bool, error) {
	const q = `
		SELECT user_id FROM user_workspaces
		WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL
		LIMIT 1`
	var got string
	err := r.Pool.QueryRow(ctx, q, workspaceID, userID).Scan(&got)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// FindFirstMemberID mirrors findFirstMemberId — no ORDER BY, "first" is
// whatever Postgres returns first. Kept identical, not made deterministic.
func (r *IntegrationsRepo) FindFirstMemberID(ctx context.Context, workspaceID string) (string, error) {
	const q = `
		SELECT user_id FROM user_workspaces
		WHERE workspace_id = $1 AND deleted_at IS NULL
		LIMIT 1`
	var userID string
	err := r.Pool.QueryRow(ctx, q, workspaceID).Scan(&userID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return userID, nil
}

// FindWorkspaceIDBySlugOrID mirrors findWorkspaceIdBySlugOrId.
func (r *IntegrationsRepo) FindWorkspaceIDBySlugOrID(ctx context.Context, slugOrID string) (string, error) {
	const q = `
		SELECT id FROM workspaces
		WHERE (slug = $1 OR id = $1) AND deleted_at IS NULL
		LIMIT 1`
	var id string
	err := r.Pool.QueryRow(ctx, q, slugOrID).Scan(&id)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return id, nil
}
