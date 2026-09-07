package repo

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oewang/worker/internal/cuid"
)

// Wallet mirrors the subset of a wallets row the import flow needs.
type Wallet struct {
	ID   string
	Name string
}

// Category mirrors the subset of a categories row the import flow needs.
type Category struct {
	ID   string
	Name string
	Type string
}

// TransactionsRepo wraps the pgxpool.Pool for wallets/categories/
// transactions/audit_logs access, ported from
// apps/api/modules/transactions/{transactions,wallets,categories}.repository.ts
// and audit-logs.service.ts.
type TransactionsRepo struct {
	Pool *pgxpool.Pool
}

// FindWallets mirrors WalletsRepository.findMany(workspaceId).
func (r *TransactionsRepo) FindWallets(ctx context.Context, workspaceID string) ([]Wallet, error) {
	const q = `SELECT id, name FROM wallets WHERE workspace_id = $1 AND deleted_at IS NULL`
	rows, err := r.Pool.Query(ctx, q, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var wallets []Wallet
	for rows.Next() {
		var w Wallet
		if err := rows.Scan(&w.ID, &w.Name); err != nil {
			return nil, err
		}
		wallets = append(wallets, w)
	}
	return wallets, rows.Err()
}

// FindCategories mirrors CategoriesRepository.findMany(workspaceId).
func (r *TransactionsRepo) FindCategories(ctx context.Context, workspaceID string) ([]Category, error) {
	const q = `SELECT id, name, type FROM categories WHERE workspace_id = $1 AND deleted_at IS NULL`
	rows, err := r.Pool.Query(ctx, q, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Type); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	return categories, rows.Err()
}

// CreateCategory mirrors one row of CategoriesRepository.createMany. Called
// once per missing category during import (the TS batches these into one
// multi-row INSERT; a Go loop of single-row inserts is functionally
// equivalent here — import already runs sequentially per transaction row).
func (r *TransactionsRepo) CreateCategory(ctx context.Context, workspaceID, name, categoryType string) (Category, error) {
	id := cuid.New()
	const q = `INSERT INTO categories (id, workspace_id, name, type) VALUES ($1, $2, $3, $4)`
	if _, err := r.Pool.Exec(ctx, q, id, workspaceID, name, categoryType); err != nil {
		return Category{}, err
	}
	return Category{ID: id, Name: name, Type: categoryType}, nil
}

// Transaction mirrors the columns import writes/reads back for an
// audit-log `after` snapshot.
type Transaction struct {
	ID          string
	WorkspaceID string
	WalletID    string
	CategoryID  *string
	Amount      string
	Date        string
	Type        string
	Name        *string
	Description *string
}

// CreateTransaction mirrors TransactionsRepository.create — a plain insert
// of the columns the import flow populates (to_wallet_id, assigned_user_id,
// original_amount/currency/exchange_rate are all left NULL, matching import's
// single-currency, non-transfer path).
func (r *TransactionsRepo) CreateTransaction(ctx context.Context, tx Transaction) (string, error) {
	id := cuid.New()
	const q = `
		INSERT INTO transactions (id, workspace_id, wallet_id, category_id, amount, date, type, name, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	_, err := r.Pool.Exec(ctx, q, id, tx.WorkspaceID, tx.WalletID, tx.CategoryID, tx.Amount, tx.Date, tx.Type, tx.Name, tx.Description)
	if err != nil {
		return "", err
	}
	return id, nil
}

// UpdateWalletBalance mirrors WalletsRepository.updateBalance's atomic
// UPDATE ... SET balance = balance + $delta (a single statement, no
// read-then-write — safe under concurrent writers).
func (r *TransactionsRepo) UpdateWalletBalance(ctx context.Context, walletID, workspaceID string, delta float64) error {
	const q = `
		UPDATE wallets SET balance = balance + $1, updated_at = now()
		WHERE id = $2 AND workspace_id = $3 AND deleted_at IS NULL`
	_, err := r.Pool.Exec(ctx, q, delta, walletID, workspaceID)
	return err
}

// redactedAuditKeys mirrors AuditLogsService's sanitize() redaction list —
// shallow, top-level only.
var redactedAuditKeys = map[string]struct{}{
	"password":       {},
	"secret":         {},
	"token":          {},
	"api_key":        {},
	"encryption_key": {},
}

func sanitizeAuditPayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	out := make(map[string]any, len(payload))
	for k, v := range payload {
		if _, redacted := redactedAuditKeys[k]; redacted {
			out[k] = "[REDACTED]"
			continue
		}
		out[k] = v
	}
	return out
}

// CreateAuditLog mirrors AuditLogsService.log — inserts one audit_logs row,
// applying the same shallow top-level redaction to `after` (and `before`,
// unused by the import flow) that the TS service applies.
func (r *TransactionsRepo) CreateAuditLog(ctx context.Context, workspaceID, userID, action, entity, entityID string, after map[string]any) error {
	sanitized := sanitizeAuditPayload(after)
	const q = `
		INSERT INTO audit_logs (id, workspace_id, user_id, action, entity, entity_id, after)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	var raw []byte
	if sanitized != nil {
		encoded, err := json.Marshal(sanitized)
		if err != nil {
			return err
		}
		raw = encoded
	}
	_, err := r.Pool.Exec(ctx, q, cuid.New(), workspaceID, userID, action, entity, entityID, raw)
	return err
}
