package repo

import (
	"context"
	"errors"
	"regexp"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIntegrationsRepo_FindByTelegramChatID_Found(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	rows := pgxmock.NewRows([]string{"id", "workspace_id", "settings", "connected_by"}).
		AddRow("int-1", "ws-1", []byte(`{"telegramChatId":"123"}`), (*string)(nil))
	mock.ExpectQuery(regexp.QuoteMeta("FROM workspace_integrations")).
		WithArgs("123").
		WillReturnRows(rows)

	got, err := repo.FindByTelegramChatID(context.Background(), "123")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "int-1", got.ID)
	assert.Equal(t, "ws-1", got.WorkspaceID)
	assert.Equal(t, "123", got.Settings["telegramChatId"])
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_FindByTelegramChatID_NotFoundReturnsNilNil(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM workspace_integrations")).
		WithArgs("999").
		WillReturnError(pgx.ErrNoRows)

	got, err := repo.FindByTelegramChatID(context.Background(), "999")
	require.NoError(t, err)
	assert.Nil(t, got)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_FindByTelegramChatID_PropagatesDBError(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM workspace_integrations")).
		WithArgs("123").
		WillReturnError(errors.New("connection reset"))

	_, err := repo.FindByTelegramChatID(context.Background(), "123")
	assert.Error(t, err)
}

func TestIntegrationsRepo_ConnectTelegram_UpdatesExistingIntegration(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM workspace_integrations")).
		WithArgs("ws-1", "telegram").
		WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("int-1"))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE workspace_integrations SET")).
		WithArgs("int-1", pgxmock.AnyArg(), pgxmock.AnyArg(), "user-1").
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := repo.ConnectTelegram(context.Background(), "ws-1", "user-1", "123")
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_ConnectTelegram_InsertsWhenNoExistingIntegration(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM workspace_integrations")).
		WithArgs("ws-1", "telegram").
		WillReturnError(pgx.ErrNoRows)
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO workspace_integrations")).
		WithArgs(pgxmock.AnyArg(), "ws-1", pgxmock.AnyArg(), pgxmock.AnyArg(), "user-1").
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err := repo.ConnectTelegram(context.Background(), "ws-1", "user-1", "123")
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_UpdateSettings_UpdatesRow(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE workspace_integrations SET settings")).
		WithArgs("int-1", "ws-1", pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := repo.UpdateSettings(context.Background(), "int-1", "ws-1", map[string]any{"foo": "bar"})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_IsWorkspaceMember_TrueWhenFound(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM user_workspaces")).
		WithArgs("ws-1", "user-1").
		WillReturnRows(pgxmock.NewRows([]string{"user_id"}).AddRow("user-1"))

	ok, err := repo.IsWorkspaceMember(context.Background(), "ws-1", "user-1")
	require.NoError(t, err)
	assert.True(t, ok)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIntegrationsRepo_IsWorkspaceMember_FalseWhenNotFound(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM user_workspaces")).
		WithArgs("ws-1", "user-2").
		WillReturnError(pgx.ErrNoRows)

	ok, err := repo.IsWorkspaceMember(context.Background(), "ws-1", "user-2")
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestIntegrationsRepo_FindFirstMemberID_ReturnsEmptyWhenNoneFound(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM user_workspaces")).
		WithArgs("ws-1").
		WillReturnError(pgx.ErrNoRows)

	id, err := repo.FindFirstMemberID(context.Background(), "ws-1")
	require.NoError(t, err)
	assert.Empty(t, id)
}

func TestIntegrationsRepo_FindFirstMemberID_ReturnsFoundID(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM user_workspaces")).
		WithArgs("ws-1").
		WillReturnRows(pgxmock.NewRows([]string{"user_id"}).AddRow("user-1"))

	id, err := repo.FindFirstMemberID(context.Background(), "ws-1")
	require.NoError(t, err)
	assert.Equal(t, "user-1", id)
}

func TestIntegrationsRepo_FindWorkspaceIDBySlugOrID_ReturnsEmptyWhenNotFound(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM workspaces")).
		WithArgs("missing").
		WillReturnError(pgx.ErrNoRows)

	id, err := repo.FindWorkspaceIDBySlugOrID(context.Background(), "missing")
	require.NoError(t, err)
	assert.Empty(t, id)
}

func TestIntegrationsRepo_FindWorkspaceIDBySlugOrID_ReturnsFoundID(t *testing.T) {
	mock := newMockPool(t)
	repo := &IntegrationsRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM workspaces")).
		WithArgs("acme").
		WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("ws-1"))

	id, err := repo.FindWorkspaceIDBySlugOrID(context.Background(), "acme")
	require.NoError(t, err)
	assert.Equal(t, "ws-1", id)
}
