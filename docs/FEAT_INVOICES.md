# Feature: Invoices

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_CONTACTS.md](./FEAT_CONTACTS.md) · [FEAT_BILLING.md](./FEAT_BILLING.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/invoices.ts`
- Adding endpoints to `apps/api/modules/invoices/invoices.controller.ts`
- Changing JWT token generation in `apps/api/modules/invoices/invoices.utils.ts`
- Adding fields to `lineItems` or `invoiceSettings` JSONB

---

## Purpose

Invoices allow workspaces to create and send professional invoices to contacts. Each invoice has line items, tax/VAT settings, and can be shared publicly via a JWT-secured URL. The public invoice view (`/invoice/[token]`) requires no authentication — it is accessible by the recipient.

---

## Data Model

### `invoices` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspaceId` | `text` FK → workspaces | Required |
| `contactId` | `text` FK → contacts | Required. FK is `restrict` — cannot delete contact with invoices |
| `invoiceNumber` | `text` | Required, e.g. `INV-001` |
| `status` | `text` | `draft` \| `unpaid` \| `paid` \| `overdue` \| `canceled` |
| `issueDate` | `timestamp` | Optional |
| `dueDate` | `timestamp` | Optional |
| `amount` | `decimal(19,4)` | Total invoice amount. Default `0` |
| `vat` | `decimal(19,4)` | VAT amount. Default `0` |
| `tax` | `decimal(19,4)` | Tax amount. Default `0` |
| `currency` | `text` | ISO currency code. Default `USD` |
| `internalNote` | `text` | Internal note (not shown to recipient) |
| `noteDetails` | `text` | Note visible to recipient |
| `paymentDetails` | `text` | Payment instructions for recipient |
| `logoUrl` | `text` | Optional company logo URL |
| `lineItems` | `jsonb` | Array of `{ name, quantity, price, unit?, discount?, tax? }` |
| `invoiceSize` | `text` | `A4` \| `Letter` |
| `dateFormat` | `text` | e.g. `DD/MM/YYYY` |
| `paymentTerms` | `text` | e.g. `Due on Receipt`, `Net 30` |
| `templateName` | `text` | PDF template name. Default `Default` |
| `invoiceSettings` | `jsonb` | Feature flags: `{ salesTax, vat, lineItemTax, discount, decimals, units, qrCode }` |
| `isPublic` | `boolean` | Whether public link is enabled |
| `accessCode` | `text` | Optional access code for public link |
| `createdAt` | `timestamp` | Auto |
| `updatedAt` | `timestamp` | Auto |
| `deletedAt` | `timestamp` | Soft delete |

---

## API Endpoints

### Authenticated Routes

Base path: `/v1/invoices`

| Method | Path | Role Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/` | Any authenticated | List invoices (paginated) |
| `GET` | `/:id` | Any authenticated | Get invoice details |
| `GET` | `/:id/token` | Any authenticated | Generate JWT share token for public link |
| `POST` | `/` | Editor+ | Create a new invoice |
| `PATCH` | `/:id` | Editor+ | Update invoice fields |
| `DELETE` | `/:id` | Editor+ | Soft-delete invoice |

### Public Routes (no auth)

Base path: `/v1/invoices/public`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/invoice/:token` | None (JWT in URL) | Get invoice details for public view |

---

## Business Logic

### Public Share Link (JWT Token)

`GET /v1/invoices/:id/token` generates a signed JWT containing `{ invoiceId, workspaceId }`. The token is short-lived (configurable) and is embedded in the public URL:

```
/invoice/{token}
```

The `PublicInvoicesController` verifies the JWT, fetches the invoice, and returns it without requiring session auth. `isPublic` must be `true` on the invoice for the public endpoint to return data.

### Invoice Number

`invoiceNumber` is user-defined (not auto-generated). The service validates uniqueness per workspace. Duplicate numbers → `409 CONFLICT`.

### Status Transitions

Status is managed manually by the workspace. Expected flow:
```
draft → unpaid → paid
              ↘ overdue (when past dueDate)
       → canceled (at any point)
```

No automatic status transitions — this is intentional for flexibility.

### Line Items JSONB

`lineItems` is a JSONB array. Each item:
```json
{
  "name": "Consulting (3 hours)",
  "quantity": 3,
  "price": 100,
  "unit": "hour",
  "discount": 0,
  "tax": 0
}
```

The `amount` field on the invoice is the sum of all line items (computed client-side and stored). The API does not auto-compute `amount` from line items.

---

## Source Files

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/invoices.ts` |
| Controller | `apps/api/modules/invoices/invoices.controller.ts` |
| Controller | `apps/api/modules/invoices/public-invoices.controller.ts` |
| Service | `apps/api/modules/invoices/invoices.service.ts` |
| Repository | `apps/api/modules/invoices/invoices.repository.ts` |
| DTOs | `apps/api/modules/invoices/invoices.dto.ts` |
| Utils | `apps/api/modules/invoices/invoices.utils.ts` |
| Tests | `apps/api/modules/invoices/invoices.utils.test.ts` (24 tests — JWT round-trip) |
| E2E | `apps/app/e2e/invoices.spec.ts` |
| Frontend page | `apps/app/app/(main)/[locale]/(dashboard)/invoices/` |
| Public page | `apps/app/app/(main)/[locale]/invoice/[token]/` |
