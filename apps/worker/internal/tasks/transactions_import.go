package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

	"github.com/hibiken/asynq"

	"github.com/oewang/worker/internal/aiclient"
	"github.com/oewang/worker/internal/repo"
)

// TypeTransactionsImport is enqueued on demand, one per uploaded CSV/bank
// statement file. Ported from apps/api's synchronous
// POST /transactions/import → TransactionsImportService.importFromFile,
// which blocked the whole HTTP request on an AI-sidecar extraction call
// plus a sequential per-row DB write loop. The worker now calls apps/ai's
// /import/extract directly (bypassing apps/api for this hop, same as the
// Telegram port) and owns the DB writes itself.
const TypeTransactionsImport = "transactions:import"

// transactionsImportMaxRetry bounds retries for this task: a bank-statement
// extraction/DB-write failure is unlikely to resolve itself by retrying 25
// times (asynq's default) — a couple of attempts catches transient sidecar/
// DB hiccups without leaving a job stuck "pending" for an hour.
const transactionsImportMaxRetry = 2

// TransactionsImportPayload carries the uploaded file (as base64 — apps/api
// never persists it to storage for this flow, it holds the raw bytes
// in-memory and forwards them, same as it does to apps/ai today) plus the
// acting workspace/user and the job row (apps/api's transaction_import_jobs
// table) to report status back to.
type TransactionsImportPayload struct {
	JobID       string `json:"job_id"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Data        string `json:"data"` // base64
	MimeType    string `json:"mime_type"`
}

// NewTransactionsImportTask builds the task for one import request.
func NewTransactionsImportTask(payload TransactionsImportPayload) (*asynq.Task, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("tasks: encode transactions import payload: %w", err)
	}
	return asynq.NewTask(
		TypeTransactionsImport, encoded,
		asynq.Queue("default"),
		asynq.MaxRetry(transactionsImportMaxRetry),
	), nil
}

// TransactionsExtractor is the narrow apps/ai surface this handler needs.
// Satisfied by *aiclient.Client.
type TransactionsExtractor interface {
	ExtractTransactions(ctx context.Context, base64Data, mimeType string, walletNames, categoryNames []string, workspaceID string) ([]aiclient.ExtractedTransaction, error)
}

// TransactionsStore is the narrow Postgres surface this handler needs.
// Satisfied by *repo.TransactionsRepo.
type TransactionsStore interface {
	FindWallets(ctx context.Context, workspaceID string) ([]repo.Wallet, error)
	FindCategories(ctx context.Context, workspaceID string) ([]repo.Category, error)
	CreateCategory(ctx context.Context, workspaceID, name, categoryType string) (repo.Category, error)
	CreateTransaction(ctx context.Context, tx repo.Transaction) (string, error)
	UpdateWalletBalance(ctx context.Context, walletID, workspaceID string, delta float64) error
	CreateAuditLog(ctx context.Context, workspaceID, userID, action, entity, entityID string, after map[string]any) error
}

// ImportJobsStore writes back to apps/api's transaction_import_jobs row so
// the frontend's polling GET /transactions/import/:jobId endpoint (apps/api,
// reading the same table) can observe completion. Satisfied by
// *repo.TransactionImportJobsRepo.
type ImportJobsStore interface {
	MarkSucceeded(ctx context.Context, jobID string, imported, skipped int) error
	MarkFailed(ctx context.Context, jobID string, errMsg string) error
}

// TransactionsImportHandler owns the CSV/bank-statement import flow: fetch
// wallets/categories, extract structured rows from apps/ai, auto-create
// missing categories, then write each transaction (+ wallet balance +
// audit log) sequentially — matching TransactionsImportService.importFromFile's
// exact behavior, including its "no wrapping transaction, swallow a failed
// row as skipped" semantics (not something this port fixes unless asked).
type TransactionsImportHandler struct {
	AI    TransactionsExtractor
	Store TransactionsStore
	Jobs  ImportJobsStore
}

// markFailedIfFinalAttempt marks the job row failed once asynq has
// exhausted its retries — an error on an earlier attempt just lets asynq
// retry silently, so the job stays "pending" instead of flashing "failed"
// then recovering. If retry metadata isn't present in ctx (e.g. the handler
// invoked outside a real asynq server, as in unit tests), it fails safe and
// marks the job failed immediately rather than leaving it stuck "pending"
// forever with no signal.
func (h *TransactionsImportHandler) markFailedIfFinalAttempt(ctx context.Context, jobID string, cause error) {
	if h.Jobs == nil || jobID == "" {
		return
	}
	retried, hasRetried := asynq.GetRetryCount(ctx)
	maxRetry, hasMaxRetry := asynq.GetMaxRetry(ctx)
	if hasRetried && hasMaxRetry && retried < maxRetry {
		return
	}
	if err := h.Jobs.MarkFailed(ctx, jobID, cause.Error()); err != nil {
		log.Printf("transactions_import: mark job %s failed: %v", jobID, err)
	}
}

func (h *TransactionsImportHandler) Handle(ctx context.Context, t *asynq.Task) error {
	var payload TransactionsImportPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("tasks: decode transactions import payload: %w", err)
	}

	wallets, err := h.Store.FindWallets(ctx, payload.WorkspaceID)
	if err != nil {
		h.markFailedIfFinalAttempt(ctx, payload.JobID, err)
		return fmt.Errorf("tasks: find wallets: %w", err)
	}
	categories, err := h.Store.FindCategories(ctx, payload.WorkspaceID)
	if err != nil {
		h.markFailedIfFinalAttempt(ctx, payload.JobID, err)
		return fmt.Errorf("tasks: find categories: %w", err)
	}

	walletNames := make([]string, len(wallets))
	walletMap := make(map[string]string, len(wallets)) // lowercase(name) -> id
	for i, w := range wallets {
		walletNames[i] = w.Name
		walletMap[strings.ToLower(w.Name)] = w.ID
	}

	categoryNames := make([]string, len(categories))
	categoryMap := make(map[string]repo.Category, len(categories)) // lowercase(name) -> category
	for i, c := range categories {
		categoryNames[i] = c.Name
		categoryMap[strings.ToLower(c.Name)] = c
	}

	extracted, err := h.AI.ExtractTransactions(ctx, payload.Data, payload.MimeType, walletNames, categoryNames, payload.WorkspaceID)
	if err != nil {
		h.markFailedIfFinalAttempt(ctx, payload.JobID, err)
		return fmt.Errorf("tasks: extract transactions: %w", err)
	}
	if len(extracted) == 0 {
		log.Printf("transactions_import: no transactions found in file for workspace %s", payload.WorkspaceID)
		if h.Jobs != nil && payload.JobID != "" {
			if err := h.Jobs.MarkSucceeded(ctx, payload.JobID, 0, 0); err != nil {
				log.Printf("transactions_import: mark job %s succeeded: %v", payload.JobID, err)
			}
		}
		return nil
	}

	// Auto-create missing categories, inferring type "income" if any
	// extracted row for that category name says "income" (else "expense")
	// — matches the TS loop's inference exactly.
	type missingCategory struct {
		originalName string
		hasIncome    bool
	}
	missingByKey := map[string]*missingCategory{} // lowercase(name) -> info
	var missingOrder []string
	for _, tx := range extracted {
		if tx.CategoryName == nil || strings.TrimSpace(*tx.CategoryName) == "" {
			continue
		}
		key := strings.ToLower(*tx.CategoryName)
		if _, exists := categoryMap[key]; exists {
			continue
		}
		info, seen := missingByKey[key]
		if !seen {
			info = &missingCategory{originalName: *tx.CategoryName}
			missingByKey[key] = info
			missingOrder = append(missingOrder, key)
		}
		if tx.Type == "income" {
			info.hasIncome = true
		}
	}
	for _, key := range missingOrder {
		info := missingByKey[key]
		categoryType := "expense"
		if info.hasIncome {
			categoryType = "income"
		}
		created, err := h.Store.CreateCategory(ctx, payload.WorkspaceID, info.originalName, categoryType)
		if err != nil {
			h.markFailedIfFinalAttempt(ctx, payload.JobID, err)
			return fmt.Errorf("tasks: create category %q: %w", info.originalName, err)
		}
		categoryMap[key] = created
	}

	var defaultWalletID string
	if len(wallets) > 0 {
		defaultWalletID = wallets[0].ID
	}

	imported, skipped := 0, 0
	for _, tx := range extracted {
		walletID := defaultWalletID
		if tx.WalletName != nil {
			if id, ok := walletMap[strings.ToLower(*tx.WalletName)]; ok {
				walletID = id
			}
		}
		if walletID == "" {
			skipped++
			continue
		}

		var categoryID *string
		if tx.CategoryName != nil {
			if c, ok := categoryMap[strings.ToLower(*tx.CategoryName)]; ok {
				id := c.ID
				categoryID = &id
			}
		}

		amountStr := strconv.FormatFloat(tx.Amount, 'f', -1, 64)

		created, err := h.Store.CreateTransaction(ctx, repo.Transaction{
			WorkspaceID: payload.WorkspaceID,
			WalletID:    walletID,
			CategoryID:  categoryID,
			Amount:      amountStr,
			Date:        tx.Date,
			Type:        tx.Type,
			Name:        strPtrOrNil(tx.Name),
			Description: tx.Description,
		})
		if err != nil {
			log.Printf("transactions_import: create transaction failed, skipping row: %v", err)
			skipped++
			continue
		}

		switch tx.Type {
		case "expense":
			if err := h.Store.UpdateWalletBalance(ctx, walletID, payload.WorkspaceID, -tx.Amount); err != nil {
				log.Printf("transactions_import: update wallet balance failed: %v", err)
				skipped++
				continue
			}
		case "income":
			if err := h.Store.UpdateWalletBalance(ctx, walletID, payload.WorkspaceID, tx.Amount); err != nil {
				log.Printf("transactions_import: update wallet balance failed: %v", err)
				skipped++
				continue
			}
		}
		// type == "transfer": no balance adjustment, matches TS (no case for it)

		if err := h.Store.CreateAuditLog(ctx, payload.WorkspaceID, payload.UserID, "transaction.imported", "transaction", created, map[string]any{
			"id": created, "workspaceId": payload.WorkspaceID, "walletId": walletID, "categoryId": categoryID,
			"amount": amountStr, "date": tx.Date, "type": tx.Type, "name": tx.Name, "description": tx.Description,
		}); err != nil {
			log.Printf("transactions_import: audit log failed: %v", err)
		}

		imported++
	}

	log.Printf("transactions_import: workspace=%s imported=%d skipped=%d", payload.WorkspaceID, imported, skipped)
	if h.Jobs != nil && payload.JobID != "" {
		if err := h.Jobs.MarkSucceeded(ctx, payload.JobID, imported, skipped); err != nil {
			log.Printf("transactions_import: mark job %s succeeded: %v", payload.JobID, err)
		}
	}
	return nil
}

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
