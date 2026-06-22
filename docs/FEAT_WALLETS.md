# Feature: Wallets & Wallet Groups

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md) · [FEAT_TRANSACTIONS.md](./FEAT_TRANSACTIONS.md)

---

## 🤖 AI Agent: Update This Doc When

- Adding or modifying fields in `packages/database/schema/wallets.ts` or `wallet-groups.ts`
- Adding endpoints to `apps/api/modules/wallets/wallets.controller.ts`
- Changing business rules in `apps/api/modules/wallets/wallets.service.ts`
- Adding wallet-related UI components in `apps/app/components/`
- Changing the **mobile** account/group screens in `apps/native/lib/components/organisms/wallets/`

---

## Purpose

Wallets represent financial accounts (bank accounts, cash, digital wallets, etc.). They hold a running balance and are the source/destination of all transactions. Wallet Groups provide organizational hierarchy for grouping related wallets.

---

## Data Model

### `wallets` table

| Column               | Type                      | Notes                                         |
| -------------------- | ------------------------- | --------------------------------------------- |
| `id`                 | `text` (CUID2)            | Primary key                                   |
| `workspaceId`        | `text` FK → workspaces    | Required — workspace isolation                |
| `groupId`            | `text` FK → wallet_groups | Optional — `null` = ungrouped                 |
| `name`               | `text`                    | Required, min 2 chars                         |
| `balance`            | `decimal(19,4)`           | Running balance. Default `0`                  |
| `isIncludedInTotals` | `boolean`                 | Whether to count in net worth. Default `true` |
| `sortOrder`          | `integer`                 | Display order within group. Default `0`       |
| `createdAt`          | `timestamp`               | Auto                                          |
| `updatedAt`          | `timestamp`               | Auto                                          |
| `deletedAt`          | `timestamp`               | Soft delete — `null` = active                 |

### `wallet_groups` table

| Column        | Type                   | Notes                      |
| ------------- | ---------------------- | -------------------------- |
| `id`          | `text` (CUID2)         | Primary key                |
| `workspaceId` | `text` FK → workspaces | Required                   |
| `name`        | `text`                 | Required                   |
| `sortOrder`   | `integer`              | Display order. Default `0` |
| `createdAt`   | `timestamp`            | Auto                       |
| `updatedAt`   | `timestamp`            | Auto                       |
| `deletedAt`   | `timestamp`            | Soft delete                |

---

## API Endpoints

Base path: `/v1`

### Wallet Groups

| Method   | Path                     | Role Required     | Description                                   |
| -------- | ------------------------ | ----------------- | --------------------------------------------- |
| `GET`    | `/wallet-groups`         | Any authenticated | List all groups for workspace                 |
| `POST`   | `/wallet-groups`         | Editor+           | Create a new wallet group                     |
| `PUT`    | `/wallet-groups/reorder` | Editor+           | Reorder multiple groups at once               |
| `PUT`    | `/wallet-groups/:id`     | Editor+           | Rename or update a group                      |
| `DELETE` | `/wallet-groups/:id`     | Editor+           | Soft-delete group; wallets moved to ungrouped |

### Wallets

| Method   | Path               | Role Required     | Description                                          |
| -------- | ------------------ | ----------------- | ---------------------------------------------------- |
| `GET`    | `/wallets`         | Any authenticated | List wallets (paginated, filterable by group/search) |
| `GET`    | `/wallets/:id`     | Any authenticated | Get single wallet details                            |
| `POST`   | `/wallets`         | Editor+           | Create a new wallet with optional initial balance    |
| `PUT`    | `/wallets/reorder` | Editor+           | Reorder wallets and reassign groups in bulk          |
| `PUT`    | `/wallets/:id`     | Editor+           | Update name, group, balance visibility               |
| `DELETE` | `/wallets/:id`     | Editor+           | Soft-delete wallet                                   |

**Query params for `GET /wallets`:**

- `search` — filter by name
- `groupId` — filter by group
- `page` (default: 1), `limit` (default: 20, max: 250)

---

## Business Logic

### Balance Updates

**Wallet balance is never edited directly by the user** (except via initial balance on creation). It is updated automatically by `TransactionsService`:

```
expense  → walletId.balance -= amount
income   → walletId.balance += amount
transfer → walletId.balance -= amount, toWalletId.balance += amount
```

Direct balance edits via `PUT /wallets/:id` only update `name`, `groupId`, `isIncludedInTotals`, and `sortOrder` — not `balance`.

### Reordering

`PUT /wallets/reorder` accepts an array of `{ id, sortOrder, groupId? }` and updates all in a single DB call. This also allows moving wallets between groups in a single request.

### Group Deletion Behavior

Soft-deleting a group does **not** delete its wallets. Instead, wallets have `groupId` set to `null` (ungrouped) before the group is soft-deleted. This is enforced at the repository level.

### Audit Trail

Every mutation (`create`, `update`, `delete`, `reorder`) calls `AuditLogsService.log()`.

Every mutation triggers `RealtimeService.notifyValueChange(workspaceId, "wallets")` to push live updates to all connected workspace clients via WebSocket.

---

## Source Files

| Layer      | File                                                        |
| ---------- | ----------------------------------------------------------- |
| Schema     | `packages/database/schema/wallets.ts`                       |
| Schema     | `packages/database/schema/wallet-groups.ts`                 |
| Controller | `apps/api/modules/wallets/wallets.controller.ts`            |
| Service    | `apps/api/modules/wallets/wallets.service.ts`               |
| Repository | `apps/api/modules/wallets/wallets.repository.ts`            |
| DTOs       | `apps/api/modules/wallets/wallets.dto.ts`                   |
| Utils      | `apps/api/modules/wallets/wallets.utils.ts`                 |
| Tests      | `apps/api/modules/wallets/wallets.utils.test.ts` (44 tests) |
| E2E        | `apps/app/e2e/accounts.spec.ts`                             |
| Mobile     | `apps/native/lib/components/organisms/wallets/wallets_account_group_screen.dart` (group list: delete/edit/drag-reorder) |
| Mobile     | `apps/native/lib/components/organisms/wallets/wallets_account_group_form_screen.dart` (group add/edit, nullable group arg) |
| Mobile     | `apps/native/lib/components/organisms/wallets/wallets_account_simple_list_screen.dart` (accounts grouped; delete/edit CRUD, empty groups hidden, no drag) |
| Mobile     | `apps/native/lib/components/organisms/wallets/wallets_account_form_screen.dart` (account add/edit, nullable wallet arg; currency row = workspace main (IDR base) + workspace sub-currencies (from the global `subCurrenciesProvider`), shown by ISO **code** (IDR/SGD/USD), default main, display-only via its own `_CurrencyPicker` chips; the balance uses the plain `Input(context: InputContext.amount)` keypad, which never shows currency tabs) |
| Mobile     | `apps/native/lib/components/molecules/swipe_action_row.dart` (shared swipe-delete + edit + optional drag row) |
| Mobile     | `apps/native/lib/components/organisms/wallets/wallets_screen.dart` (Accounts tab; pencil → edit mode using `SwipeActionRow`: minus reveals a Delete button (no eye/drag); empty groups hidden; tap row → edit) |
| Mobile     | `apps/native/lib/data/repositories/wallets_repository.dart` & `wallet_groups_repository.dart` (+ remote/fake — full CRUD; wallets also `reorder` + `setIncludedInTotals`; groups also reorder) |
| Mobile     | `apps/native/lib/domain/models/wallet.dart` & `data/dto/wallet_dto.dart` (added `isIncludedInTotals`; `AccountsViewModel` excludes hidden wallets from Assets/Liabilities/Total) |

---

## Known Constraints & Edge Cases

- A wallet cannot be deleted if it has active transactions (depends on DB FK constraint behavior — currently `cascade` on transactions).
- `balance` is stored as `decimal(19,4)` — always handle as string in service/DTO to avoid floating-point precision loss.
- When `isIncludedInTotals = false`, the wallet is excluded from the net-worth calculation on the Overview page.
- The `reorder` endpoint also functions as a move-to-group endpoint — this is intentional.
