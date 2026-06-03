# Feature: Contacts

> See also: [CLAUDE.md](../CLAUDE.md) · [FEAT_DEBTS.md](./FEAT_DEBTS.md) · [FEAT_INVOICES.md](./FEAT_INVOICES.md)

---

## 🤖 AI Agent: Update This Doc When

- Modifying `packages/database/schema/contacts.ts`
- Adding endpoints to `apps/api/modules/contacts/contacts.controller.ts`

---

## Purpose

Contacts represent people or businesses that the workspace interacts with financially. They are referenced by Debts (who owes/is owed money) and Invoices (the recipient/payer). Contacts store address and billing information for use in invoice generation.

---

## Data Model

### `contacts` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` (CUID2) | Primary key |
| `workspaceId` | `text` FK → workspaces | Required |
| `name` | `text` | Required |
| `email` | `text` | Optional |
| `phone` | `text` | Optional |
| `addressLine1` | `text` | Optional |
| `addressLine2` | `text` | Optional |
| `city` | `text` | Optional |
| `state` | `text` | Optional |
| `country` | `text` | Optional |
| `zip` | `text` | Optional |
| `website` | `text` | Optional |
| `note` | `text` | Optional |
| `vatNumber` | `text` | Optional — used on invoices |
| `billingEmails` | `text` | Optional additional billing email recipients |
| `createdAt` | `timestamp` | Auto |
| `updatedAt` | `timestamp` | Auto |
| `deletedAt` | `timestamp` | Soft delete |

---

## API Endpoints

Base path: `/v1/contacts`

| Method | Path | Role Required | Description |
|--------|------|--------------|-------------|
| `GET` | `/` | Any authenticated | List contacts (paginated, searchable) |
| `GET` | `/:id` | Any authenticated | Get a single contact |
| `POST` | `/` | Editor+ | Create a new contact |
| `PATCH` | `/:id` | Editor+ | Update contact details |
| `DELETE` | `/:id` | Editor+ | Soft-delete a contact |

---

## Business Logic

- Contact `name` must be unique within the workspace. Duplicate → `409 CONFLICT`.
- Contacts cannot be hard-deleted while referenced by active (non-deleted) debts or invoices. The DB enforces this via FK `onDelete: "cascade"` on `debts` (contacts cascade) and `restrict` on `invoices` (contacts restrict). Check behavior carefully before soft-deleting.
- No plan limits on contacts currently.

---

## Source Files

| Layer | File |
|-------|------|
| Schema | `packages/database/schema/contacts.ts` |
| Controller | `apps/api/modules/contacts/contacts.controller.ts` |
| Service | `apps/api/modules/contacts/contacts.service.ts` |
| Repository | `apps/api/modules/contacts/contacts.repository.ts` |
| E2E | `apps/app/e2e/contacts-debts.spec.ts` |
