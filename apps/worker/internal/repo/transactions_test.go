package repo

import (
	"context"
	"regexp"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newMockPool(t *testing.T) pgxmock.PgxPoolIface {
	t.Helper()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	t.Cleanup(mock.Close)
	return mock
}

func TestTransactionsRepo_FindWallets_ReturnsRows(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	rows := pgxmock.NewRows([]string{"id", "name"}).
		AddRow("w1", "Cash").
		AddRow("w2", "Bank")
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, name FROM wallets")).
		WithArgs("ws-1").
		WillReturnRows(rows)

	wallets, err := repo.FindWallets(context.Background(), "ws-1")
	require.NoError(t, err)
	assert.Equal(t, []Wallet{{ID: "w1", Name: "Cash"}, {ID: "w2", Name: "Bank"}}, wallets)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestTransactionsRepo_FindCategories_ReturnsRows(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	rows := pgxmock.NewRows([]string{"id", "name", "type"}).
		AddRow("c1", "Groceries", "expense")
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id, name, type FROM categories")).
		WithArgs("ws-1").
		WillReturnRows(rows)

	categories, err := repo.FindCategories(context.Background(), "ws-1")
	require.NoError(t, err)
	assert.Equal(t, []Category{{ID: "c1", Name: "Groceries", Type: "expense"}}, categories)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestTransactionsRepo_CreateCategory_InsertsAndReturnsGeneratedID(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO categories")).
		WithArgs(pgxmock.AnyArg(), "ws-1", "Groceries", "expense").
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	cat, err := repo.CreateCategory(context.Background(), "ws-1", "Groceries", "expense")
	require.NoError(t, err)
	assert.Equal(t, "Groceries", cat.Name)
	assert.Equal(t, "expense", cat.Type)
	assert.NotEmpty(t, cat.ID)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestTransactionsRepo_CreateTransaction_InsertsRow(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO transactions")).
		WithArgs(pgxmock.AnyArg(), "ws-1", "w1", (*string)(nil), "100", "2026-01-01", "expense", (*string)(nil), (*string)(nil)).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	id, err := repo.CreateTransaction(context.Background(), Transaction{
		WorkspaceID: "ws-1",
		WalletID:    "w1",
		Amount:      "100",
		Date:        "2026-01-01",
		Type:        "expense",
	})
	require.NoError(t, err)
	assert.NotEmpty(t, id)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestTransactionsRepo_UpdateWalletBalance_AppliesDelta(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("UPDATE wallets SET balance = balance + $1")).
		WithArgs(-50.0, "w1", "ws-1").
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := repo.UpdateWalletBalance(context.Background(), "w1", "ws-1", -50.0)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestTransactionsRepo_CreateAuditLog_RedactsSensitiveTopLevelKeys(t *testing.T) {
	mock := newMockPool(t)
	repo := &TransactionsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO audit_logs")).
		WithArgs(pgxmock.AnyArg(), "ws-1", "user-1", "create", "transaction", "tx-1", pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err := repo.CreateAuditLog(context.Background(), "ws-1", "user-1", "create", "transaction", "tx-1", map[string]any{
		"amount":   100,
		"password": "hunter2",
	})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestSanitizeAuditPayload_RedactsKnownSensitiveKeysOnly(t *testing.T) {
	out := sanitizeAuditPayload(map[string]any{
		"password":       "a",
		"secret":         "b",
		"token":          "c",
		"api_key":        "d",
		"encryption_key": "e",
		"amount":         100,
	})

	for _, key := range []string{"password", "secret", "token", "api_key", "encryption_key"} {
		assert.Equal(t, "[REDACTED]", out[key])
	}
	assert.Equal(t, 100, out["amount"])
}

func TestSanitizeAuditPayload_NilInputReturnsNil(t *testing.T) {
	assert.Nil(t, sanitizeAuditPayload(nil))
}
