package tasks

import (
	"context"
	"testing"

	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/repo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeExtractor struct {
	rows []aiclient.ExtractedTransaction
	err  error
}

func (f *fakeExtractor) ExtractTransactions(ctx context.Context, base64Data, mimeType string, walletNames, categoryNames []string, workspaceID string) ([]aiclient.ExtractedTransaction, error) {
	return f.rows, f.err
}

type fakeTransactionsStore struct {
	wallets           []repo.Wallet
	categories        []repo.Category
	createdCategories []repo.Category
	createdTx         []repo.Transaction
	balanceUpdates    []float64
	auditLogs         int
}

func (f *fakeTransactionsStore) FindWallets(ctx context.Context, workspaceID string) ([]repo.Wallet, error) {
	return f.wallets, nil
}

func (f *fakeTransactionsStore) FindCategories(ctx context.Context, workspaceID string) ([]repo.Category, error) {
	return f.categories, nil
}

func (f *fakeTransactionsStore) CreateCategory(ctx context.Context, workspaceID, name, categoryType string) (repo.Category, error) {
	c := repo.Category{ID: "cat-" + name, Name: name, Type: categoryType}
	f.createdCategories = append(f.createdCategories, c)
	f.categories = append(f.categories, c)
	return c, nil
}

func (f *fakeTransactionsStore) CreateTransaction(ctx context.Context, tx repo.Transaction) (string, error) {
	f.createdTx = append(f.createdTx, tx)
	return "tx-" + string(rune(len(f.createdTx))), nil
}

func (f *fakeTransactionsStore) UpdateWalletBalance(ctx context.Context, walletID, workspaceID string, delta float64) error {
	f.balanceUpdates = append(f.balanceUpdates, delta)
	return nil
}

func (f *fakeTransactionsStore) CreateAuditLog(ctx context.Context, workspaceID, userID, action, entity, entityID string, after map[string]any) error {
	f.auditLogs++
	return nil
}

type fakeImportJobsStore struct {
	succeededCalls []struct{ imported, skipped int }
	failedCalls    []string
}

func (f *fakeImportJobsStore) MarkSucceeded(ctx context.Context, jobID string, imported, skipped int) error {
	f.succeededCalls = append(f.succeededCalls, struct{ imported, skipped int }{imported, skipped})
	return nil
}

func (f *fakeImportJobsStore) MarkFailed(ctx context.Context, jobID string, errMsg string) error {
	f.failedCalls = append(f.failedCalls, errMsg)
	return nil
}

func strp(s string) *string { return &s }

func TestTransactionsImportHandler_NoRowsExtracted(t *testing.T) {
	ai := &fakeExtractor{rows: nil}
	store := &fakeTransactionsStore{wallets: []repo.Wallet{{ID: "w1", Name: "Cash"}}}
	jobs := &fakeImportJobsStore{}
	h := &TransactionsImportHandler{AI: ai, Store: store, Jobs: jobs}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{JobID: "job-1", WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Empty(t, store.createdTx)
	require.Len(t, jobs.succeededCalls, 1)
	assert.Equal(t, 0, jobs.succeededCalls[0].imported)
	assert.Equal(t, 0, jobs.succeededCalls[0].skipped)
	assert.Empty(t, jobs.failedCalls)
}

func TestTransactionsImportHandler_ExtractionFailure_MarksJobFailed(t *testing.T) {
	ai := &fakeExtractor{err: assert.AnError}
	store := &fakeTransactionsStore{wallets: []repo.Wallet{{ID: "w1", Name: "Cash"}}}
	jobs := &fakeImportJobsStore{}
	h := &TransactionsImportHandler{AI: ai, Store: store, Jobs: jobs}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{JobID: "job-1", WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.Error(t, err)
	// context.Background() carries no asynq retry metadata, so this fails
	// safe and marks the job failed immediately rather than leaving it
	// stuck "pending" — see markFailedIfFinalAttempt's doc comment.
	require.Len(t, jobs.failedCalls, 1)
	assert.Empty(t, jobs.succeededCalls)
}

func TestTransactionsImportHandler_NoJobsStore_DoesNotPanic(t *testing.T) {
	ai := &fakeExtractor{err: assert.AnError}
	store := &fakeTransactionsStore{}
	h := &TransactionsImportHandler{AI: ai, Store: store} // Jobs left nil

	task, err := NewTransactionsImportTask(TransactionsImportPayload{JobID: "job-1", WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.Error(t, err)
}

func TestTransactionsImportHandler_ExpenseAndIncome(t *testing.T) {
	ai := &fakeExtractor{rows: []aiclient.ExtractedTransaction{
		{Name: "Coffee", Amount: 50000, Date: "2026-01-01", Type: "expense", WalletName: strp("Cash"), CategoryName: strp("Food")},
		{Name: "Salary", Amount: 5000000, Date: "2026-01-02", Type: "income", WalletName: strp("Cash"), CategoryName: strp("Job")},
	}}
	store := &fakeTransactionsStore{
		wallets:    []repo.Wallet{{ID: "w1", Name: "Cash"}},
		categories: []repo.Category{{ID: "c1", Name: "Food", Type: "expense"}, {ID: "c2", Name: "Job", Type: "income"}},
	}
	jobs := &fakeImportJobsStore{}
	h := &TransactionsImportHandler{AI: ai, Store: store, Jobs: jobs}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{JobID: "job-1", WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)

	require.Len(t, store.createdTx, 2)
	assert.Equal(t, "w1", store.createdTx[0].WalletID)
	require.Len(t, store.balanceUpdates, 2)
	assert.Equal(t, -50000.0, store.balanceUpdates[0])
	assert.Equal(t, 5000000.0, store.balanceUpdates[1])
	assert.Equal(t, 2, store.auditLogs)
	assert.Empty(t, store.createdCategories) // both categories already existed
	require.Len(t, jobs.succeededCalls, 1)
	assert.Equal(t, 2, jobs.succeededCalls[0].imported)
	assert.Equal(t, 0, jobs.succeededCalls[0].skipped)
}

func TestTransactionsImportHandler_AutoCreatesMissingCategory(t *testing.T) {
	ai := &fakeExtractor{rows: []aiclient.ExtractedTransaction{
		{Name: "Freelance", Amount: 100000, Date: "2026-01-01", Type: "income", WalletName: strp("Cash"), CategoryName: strp("Side Gig")},
	}}
	store := &fakeTransactionsStore{wallets: []repo.Wallet{{ID: "w1", Name: "Cash"}}}
	h := &TransactionsImportHandler{AI: ai, Store: store}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)

	require.Len(t, store.createdCategories, 1)
	assert.Equal(t, "Side Gig", store.createdCategories[0].Name)
	assert.Equal(t, "income", store.createdCategories[0].Type)
	require.Len(t, store.createdTx, 1)
	assert.Equal(t, "cat-Side Gig", *store.createdTx[0].CategoryID)
}

func TestTransactionsImportHandler_SkipsRowWithNoResolvableWallet(t *testing.T) {
	ai := &fakeExtractor{rows: []aiclient.ExtractedTransaction{
		{Name: "Mystery", Amount: 1000, Date: "2026-01-01", Type: "expense", WalletName: strp("Unknown Wallet")},
	}}
	store := &fakeTransactionsStore{wallets: nil} // no wallets at all -> no default wallet either
	h := &TransactionsImportHandler{AI: ai, Store: store}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	assert.Empty(t, store.createdTx)
}

func TestTransactionsImportHandler_FallsBackToDefaultWallet(t *testing.T) {
	ai := &fakeExtractor{rows: []aiclient.ExtractedTransaction{
		{Name: "Unmatched wallet name", Amount: 1000, Date: "2026-01-01", Type: "expense", WalletName: strp("Nonexistent")},
	}}
	store := &fakeTransactionsStore{wallets: []repo.Wallet{{ID: "w1", Name: "Cash"}}}
	h := &TransactionsImportHandler{AI: ai, Store: store}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	require.Len(t, store.createdTx, 1)
	assert.Equal(t, "w1", store.createdTx[0].WalletID) // fell back to defaultWalletID
}

func TestTransactionsImportHandler_TransferDoesNotAdjustBalance(t *testing.T) {
	ai := &fakeExtractor{rows: []aiclient.ExtractedTransaction{
		{Name: "Move funds", Amount: 200000, Date: "2026-01-01", Type: "transfer", WalletName: strp("Cash")},
	}}
	store := &fakeTransactionsStore{wallets: []repo.Wallet{{ID: "w1", Name: "Cash"}}}
	h := &TransactionsImportHandler{AI: ai, Store: store}

	task, err := NewTransactionsImportTask(TransactionsImportPayload{WorkspaceID: "ws-1", UserID: "u1", Data: "abc", MimeType: "text/csv"})
	require.NoError(t, err)

	err = h.Handle(context.Background(), task)
	require.NoError(t, err)
	require.Len(t, store.createdTx, 1)
	assert.Empty(t, store.balanceUpdates)
}
