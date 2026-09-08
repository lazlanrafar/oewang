package repo

import (
	"context"
	"regexp"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAiRepo_CreateSession_InsertsAndReturnsGeneratedID(t *testing.T) {
	mock := newMockPool(t)
	repo := &AiRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO ai_sessions")).
		WithArgs(pgxmock.AnyArg(), "ws-1", "New chat").
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	id, err := repo.CreateSession(context.Background(), "ws-1", "New chat")
	require.NoError(t, err)
	assert.NotEmpty(t, id)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAiRepo_SaveMessage_WithAttachments(t *testing.T) {
	mock := newMockPool(t)
	repo := &AiRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO ai_messages")).
		WithArgs(pgxmock.AnyArg(), "sess-1", "ws-1", "user", "hi", pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err := repo.SaveMessage(context.Background(), "sess-1", "ws-1", "user", "hi", []string{"file.png"})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAiRepo_SaveMessage_WithoutAttachmentsSendsNilRaw(t *testing.T) {
	mock := newMockPool(t)
	repo := &AiRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO ai_messages")).
		WithArgs(pgxmock.AnyArg(), "sess-1", "ws-1", "assistant", "hello", []byte(nil)).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err := repo.SaveMessage(context.Background(), "sess-1", "ws-1", "assistant", "hello", nil)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAiRepo_GetSessionMessages_ReversesNewestFirstToChronological(t *testing.T) {
	mock := newMockPool(t)
	repo := &AiRepo{Pool: mock}

	// DB returns newest-first (ORDER BY created_at DESC): C, B, A.
	rows := pgxmock.NewRows([]string{"role", "content"}).
		AddRow("assistant", "C - newest").
		AddRow("user", "B").
		AddRow("user", "A - oldest")
	mock.ExpectQuery(regexp.QuoteMeta("FROM ai_messages")).
		WithArgs("sess-1", "ws-1").
		WillReturnRows(rows)

	messages, err := repo.GetSessionMessages(context.Background(), "sess-1", "ws-1")
	require.NoError(t, err)
	require.Len(t, messages, 3)
	assert.Equal(t, "A - oldest", messages[0].Content)
	assert.Equal(t, "B", messages[1].Content)
	assert.Equal(t, "C - newest", messages[2].Content)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAiRepo_GetSessionMessages_EmptyWhenNoRows(t *testing.T) {
	mock := newMockPool(t)
	repo := &AiRepo{Pool: mock}

	mock.ExpectQuery(regexp.QuoteMeta("FROM ai_messages")).
		WithArgs("sess-1", "ws-1").
		WillReturnRows(pgxmock.NewRows([]string{"role", "content"}))

	messages, err := repo.GetSessionMessages(context.Background(), "sess-1", "ws-1")
	require.NoError(t, err)
	assert.Empty(t, messages)
}

func TestNotificationsRepo_Create_InsertsRow(t *testing.T) {
	mock := newMockPool(t)
	repo := &NotificationsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO notifications")).
		WithArgs(pgxmock.AnyArg(), "user-1", "ws-1", "info", "Title", "Message", "/link").
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err := repo.Create(context.Background(), "ws-1", "user-1", "info", "Title", "Message", "/link")
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
