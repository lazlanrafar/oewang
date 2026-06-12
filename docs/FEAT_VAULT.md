# Feature: Vault (File Storage)

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md) · [FEAT_BILLING.md](./FEAT_BILLING.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/vault-files.ts`
- Changing storage logic in `apps/api/modules/vault/vault.service.ts`
- Adding endpoints to `apps/api/modules/vault/vault.controller.ts`
- Changing bucket configuration (R2 vs system bucket logic)

---

## Purpose

The Vault provides secure file storage for each workspace. Files (receipts, PDFs, documents) are stored in S3-compatible object storage (Cloudflare R2 by default, or a custom R2 endpoint configured per workspace). Vault files can be attached to transactions. Storage usage is metered against the workspace's plan quota.

---

## Data Model

### `vault_files` table

| Column        | Type                   | Notes                                            |
| ------------- | ---------------------- | ------------------------------------------------ |
| `id`          | `text` (CUID2)         | Primary key                                      |
| `workspaceId` | `text` FK → workspaces | Required                                         |
| `name`        | `text`                 | Display filename. Required                       |
| `key`         | `text`                 | S3 object key (storage path). Required           |
| `size`        | `bigint`               | File size in bytes. Required                     |
| `type`        | `text`                 | MIME type (e.g. `image/jpeg`, `application/pdf`) |
| `tags`        | `jsonb` (string[])     | Optional tags for search/filter                  |
| `metadata`    | `text`                 | JSON string for extra metadata                   |
| `createdAt`   | `timestamp`            | Auto                                             |
| `updatedAt`   | `timestamp`            | Auto                                             |
| `inactive_at` | `timestamp`            | Set when quota exceeded — file is soft-blocked   |
| `deletedAt`   | `timestamp`            | Soft delete                                      |

---

## Storage Architecture

### Bucket Resolution (per workspace)

`VaultService.getBucketClient()` resolves which bucket to use:

1. **Custom R2 (workspace-specific):** If `workspace_settings.r2Endpoint`, `r2AccessKeyId`, `r2SecretAccessKey`, and `r2BucketName` are all set → use them. Keys are encrypted at rest with `packages/encryption`.
2. **System bucket (fallback):** Uses `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_NAME` from the root `.env`.

The bucket client is cached in-memory per workspace to avoid re-initialization on every request.

### Object Key Format

Keys are constructed as: `{workspaceId}/{randomId}/{sanitizedFilename}`

This ensures workspace isolation at the storage level.

### Quota Tracking

`workspace.vault_size_used_bytes` tracks total storage used. Updated on every upload/delete.

When a workspace exceeds its plan's `max_vault_size_mb` — either by uploading more than allowed **or** by being downgraded to a plan with a smaller quota:

- New uploads are rejected with `422 + PLAN_LIMIT_EXCEEDED`
- `workspace.storage_violation_at` is set to the timestamp the violation started
- Existing files remain downloadable until the grace period expires

### Storage violation lifecycle (two-phase cleanup)

`apps/api/scripts/storage-worker.ts` runs on a cron and walks two services in order:

```
day 0  → storage_violation_at = now (set either by VaultService when upload is over,
         or by BillingLifecycleService at downgrade time if usage is already over)

day 30 → VaultService.processStorageViolations marks files inactive
         (vault_files.inactive_at = now). Hidden in the UI; R2 blobs preserved.

day 90 → VaultService.hardDeleteExtendedInactiveFiles permanently deletes R2 blobs
         and soft-deletes the rows. Vault usage is decremented.
```

At any point before day 90, if the user frees space or upgrades:

- `storage_violation_at` is cleared
- `bulkSetFilesInactive(false)` reactivates any files marked inactive in phase 2
- R2 blobs are untouched

On downgrade, `BillingLifecycleService.downgradeWorkspace` sets `storage_violation_at` **immediately** (rather than waiting for the next vault cron pass) so users get a predictable 30-day countdown and a clear notification ("Vault is over the Starter limit — 30 days to act").

### Plan Quota per Tier

| Plan                              | Default vault quota   |
| --------------------------------- | --------------------- |
| Starter                           | 250 MB                |
| Personal                          | 2 GB                  |
| Pro                               | 15 GB                 |
| Business                          | 50 GB                 |
| (See `pricing.max_vault_size_mb`) | Configurable per plan |

Extra vault storage can be purchased as an add-on.

---

## API Endpoints

Base path: `/v1/vault`

| Method   | Path            | Role Required     | Description                                     |
| -------- | --------------- | ----------------- | ----------------------------------------------- |
| `GET`    | `/`             | Any authenticated | List files (paginated, filterable by tags/type) |
| `GET`    | `/:id`          | Any authenticated | Get file metadata                               |
| `GET`    | `/:id/download` | Any authenticated | Get a signed temporary download URL             |
| `POST`   | `/upload`       | Editor+           | Upload a file (multipart/form-data)             |
| `PATCH`  | `/:id/tags`     | Editor+           | Update file tags                                |
| `DELETE` | `/:id`          | Editor+           | Soft-delete file record + delete from bucket    |

**Query params for `GET /`:**

- `type` — MIME type prefix filter (e.g. `image/`)
- `tags` — comma-separated tags
- `search` — filename search
- `page`, `limit`

---

## Business Logic

### Upload Flow

1. Receive `multipart/form-data` with `file` field
2. Check quota: `workspace.vault_size_used_bytes + file.size <= max_vault_size_bytes`
3. Generate object key
4. Upload to bucket via `packages/bucket`
5. Insert `vault_files` row
6. Update `workspace.vault_size_used_bytes += file.size`
7. Log audit + notify realtime

### Delete Flow

1. Soft-delete the `vault_files` row (`deletedAt = now()`)
2. Delete the actual object from the bucket (hard delete from storage)
3. Update `workspace.vault_size_used_bytes -= file.size`

### Download URL

Generates a presigned S3 URL valid for a short duration (typically 5 minutes). The URL is returned to the client, which opens it directly. Files are never proxied through the API.

---

## Source Files

| Layer         | File                                                    |
| ------------- | ------------------------------------------------------- |
| Schema        | `packages/database/schema/vault-files.ts`               |
| Controller    | `apps/api/modules/vault/vault.controller.ts`            |
| Service       | `apps/api/modules/vault/vault.service.ts`               |
| Repository    | `apps/api/modules/vault/vault.repository.ts`            |
| DTOs          | `apps/api/modules/vault/vault.dto.ts`                   |
| Utils         | `apps/api/modules/vault/vault.utils.ts`                 |
| Tests         | `apps/api/modules/vault/vault.utils.test.ts` (44 tests) |
| Bucket client | `packages/bucket/src/`                                  |
| E2E           | `apps/app/e2e/vault.spec.ts`                            |

---

## Known Constraints

- Maximum single file size is enforced by the `uploadFileBody` TypeBox schema (default: 50MB).
- Custom R2 credentials stored in `workspace_settings` are AES-256-GCM encrypted at rest.
- `inactive_at` is a future-use field for quota-violation soft-locking. Currently `vault_size_used_bytes` is the enforced gate.
- Files attached to transactions via `transaction_attachments` are NOT deleted when the transaction is deleted — vault files have independent lifecycle.
