# Feature: Workspace Settings & Multi-Currency

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [FEAT_WORKSPACES.md](./FEAT_WORKSPACES.md) · [FEAT_WALLETS.md](./FEAT_WALLETS.md)

---

## 🤖 AI Agent: Update This Doc When

- Adding or modifying columns in `packages/database/schema/workspace-settings.ts` or `workspace-sub-currencies.ts`
- Adding endpoints to `apps/api/modules/settings/settings.controller.ts`
- Modifying business rules in `apps/api/modules/settings/settings.service.ts` or `sub-currencies.service.ts`
- Updating currency exchange rate integration in `apps/api/modules/settings/rates/rates.service.ts`
- Adding settings or configuration UI components in `apps/app/components/setting/`

---

## Purpose

Settings configure display preferences, budget carry-over rules, and financial formatting options for each workspace. It also enables multi-currency support by allowing users to add up to 10 sub-currencies, fetching dynamic exchange rates to calculate converted amounts.

---

## Data Models

### `workspace_settings` table

Contains the UI and localization preferences for the workspace.

| Column                            | Type                   | Notes                                                                      |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `id`                              | `text` (CUID2)         | Primary key                                                                |
| `workspaceId`                     | `text` FK → workspaces | Workspace link                                                             |
| `monthlyStartDate`                | `integer`              | Start day of the month (e.g. `1` to `31`). Default `1`                     |
| `monthlyStartDateWeekendHandling` | `text`                 | Weekend adjustments: `no-changes` \| `prev-weekday` \| `next-weekday`      |
| `weeklyStartDay`                  | `text`                 | e.g. `Sunday` \| `Monday`                                                  |
| `carryOver`                       | `boolean`              | Accumulate unused budget in subsequent months. Default `false`             |
| `period`                          | `text`                 | Active budget period: `Weekly` \| `Monthly` \| `Yearly`. Default `Monthly` |
| `incomeExpensesColor`             | `text`                 | Theme behavior: `Exp.` (Red Expense / Blue Income) etc.                    |
| `autocomplete`                    | `boolean`              | Enable category/tag autocomplete on new transactions. Default `true`       |
| `timeInput`                       | `text`                 | Time field options: `None` \| `Time Only` \| `With Seconds`                |
| `startScreen`                     | `text`                 | Default landing page: `Daily` \| `Overview` \| `Calendar`                  |
| `swipeAction`                     | `text`                 | Action on list swipe: `Change Date` \| `Delete` etc.                       |
| `showDescription`                 | `boolean`              | Show detailed notes in transaction list items. Default `false`             |
| `inputOrder`                      | `text`                 | First input focus: `Amount` \| `Category` \| `Note`                        |
| `noteButton`                      | `boolean`              | Display dedicated note trigger. Default `false`                            |
| `mainCurrencyCode`                | `text`                 | Primary reporting currency (e.g. `USD`, `IDR`, `EUR`). Default `USD`       |
| `mainCurrencySymbol`              | `text`                 | Currency prefix/suffix character (e.g. `$`, `Rp`, `€`). Default `$`        |
| `mainCurrencySymbolPosition`      | `text`                 | Symbol alignment: `Front` \| `Behind`. Default `Front`                     |
| `mainCurrencyDecimalPlaces`       | `integer`              | Number of decimal places: `0` \| `2` \| `4`. Default `2`                   |
| `r2Endpoint`                      | `text`                 | Custom Cloudflare R2 endpoint for vault attachments                        |
| `r2AccessKeyId`                   | `text`                 | Encrypted R2 Access Key ID                                                 |
| `r2SecretAccessKey`               | `text`                 | Encrypted R2 Secret Access Key                                             |
| `r2BucketName`                    | `text`                 | R2 bucket name                                                             |
| `invoiceLogoUrl`                  | `text`                 | Custom logo URL for generated invoices                                     |
| `deleted_at`                      | `timestamp`            | Soft delete support                                                        |

### `workspace_sub_currencies` table

Lists additional currencies accepted for wallets/transactions within the workspace.

| Column         | Type                   | Notes                                          |
| -------------- | ---------------------- | ---------------------------------------------- |
| `id`           | `text` (CUID2)         | Primary key                                    |
| `workspaceId`  | `text` FK → workspaces | Workspace link                                 |
| `currencyCode` | `text`                 | ISO 3-letter currency code (e.g. `JPY`, `SGD`) |
| `deleted_at`   | `timestamp`            | Soft delete support                            |

---

## API Endpoints

### Workspace Settings

Base path: `/v1/settings`

| Method  | Path           | Role Required     | Description                                |
| ------- | -------------- | ----------------- | ------------------------------------------ |
| `GET`   | `/transaction` | Any authenticated | Retrieve settings for the active workspace |
| `PATCH` | `/transaction` | Editor+           | Update settings                            |

### Sub-Currencies

Base path: `/v1/settings/sub-currencies`

| Method   | Path   | Role Required     | Description                                   |
| -------- | ------ | ----------------- | --------------------------------------------- |
| `GET`    | `/`    | Any authenticated | List all sub-currencies for workspace         |
| `POST`   | `/`    | Editor+           | Add a new sub-currency (max 10 per workspace) |
| `DELETE` | `/:id` | Editor+           | Remove a sub-currency                         |

### Exchange Rates & Conversions

Base path: `/v1/settings/rates`

| Method | Path       | Role Required     | Description                                                    |
| ------ | ---------- | ----------------- | -------------------------------------------------------------- |
| `GET`  | `/`        | Any authenticated | Fetch current exchange rates relative to a query base currency |
| `GET`  | `/convert` | Any authenticated | Perform instant conversion calculation                         |

**Query params for `GET /rates`**:

- `base`: ISO code of base currency (defaults to `USD`)

**Query params for `GET /rates/convert`**:

- `amount`: Number string to convert
- `from`: ISO currency code source
- `to`: ISO currency code target

---

## Business Logic

### Encryption of Sensitive Integration Settings

Custom Cloudflare R2 credentials (`r2AccessKeyId` and `r2SecretAccessKey`) are encrypted using AES-256-GCM via the `packages/encryption` utility before being saved to the database.
When requested (`GET /transaction`), the values are masked as `********` in the response payload. They are only decrypted inside the `VaultService` for secure uploads.

### Sub-Currency Quotas & Validation

- **Limit of 10**: The service checks the count of existing sub-currencies per workspace. If `existing.length >= 10`, it blocks creation with `422 VALIDATION_ERROR`.
- **Uniqueness**: Prevents adding duplicate currency codes. Duplicate → `409 CONFLICT`.

### Dynamic Exchange Rates

Exchange rates are fetched using the `@workspace/currencyfreaks` API client.

- The client queries CurrencyFreaks, retrieving exchange rates relative to `USD`.
- The `RatesService` recalculates the rate list mathematically if a non-USD base currency is requested (e.g. `rate / baseRate`).
- Conversion performs a simple rate-to-amount calculation.

---

## Source Files

| Layer      | File                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| Schema     | `packages/database/schema/workspace-settings.ts`                        |
| Schema     | `packages/database/schema/workspace-sub-currencies.ts`                  |
| Controller | `apps/api/modules/settings/settings.controller.ts`                      |
| Controller | `apps/api/modules/settings/sub-currencies/sub-currencies.controller.ts` |
| Controller | `apps/api/modules/settings/rates/rates.controller.ts`                   |
| Service    | `apps/api/modules/settings/settings.service.ts`                         |
| Service    | `apps/api/modules/settings/sub-currencies/sub-currencies.service.ts`    |
| Service    | `apps/api/modules/settings/rates/rates.service.ts`                      |
| Repository | `apps/api/modules/settings/settings.repository.ts`                      |
| Repository | `apps/api/modules/settings/sub-currencies/sub-currencies.repository.ts` |
| Client     | `packages/currencyfreaks/index.ts`                                      |
| E2E        | `apps/app/e2e/settings.spec.ts`                                         |

---

## Known Constraints & Edge Cases

- Changing `mainCurrencyCode` updates the reporting currency of the dashboard, but does not alter the historical transaction currencies or convert wallet balances retrospectively. Users are advised to set their main currency upon workspace onboarding.
- Exchange rates are currently retrieved on every request. Introducing a Redis cache layer for the CurrencyFreaks response (with a 24-hour TTL) is planned in the backlog.
