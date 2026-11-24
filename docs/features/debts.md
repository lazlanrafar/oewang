# Feature: Debts and contacts

Status: specified, 2026-11-24, not built. Part of the [oewang docs](../README.md). Implements [PRD](../prd.md#620-debts-debt) DEBT-1 to DEBT-16 and CON-1 to CON-4. Decisions: [D120, D121 and D122](../architecture.md#decision-log). Stories: US-069 to US-073 (epic OEW-105).

A debt records money owed between the person and one contact: `payable` when they owe it, `receivable` when it is owed to them. Payments bring the remaining amount down to zero. A payment made through a wallet writes the transaction that moves the money; everything else about a debt is bookkeeping that no balance sees. Ported from the old app's debts and contacts, with its bugs fixed rather than carried.

## Update this doc when

- Changing how a payment moves money, how a payment transaction is locked, or what deleting one does.
- Changing a debt or contact route ([endpoints](../api/endpoints.md#debts)) or the `contacts`, `debts` or `debt_payments` tables ([data model](../data-model.md#debts)).
- Changing the debts page, the contacts page, a chat or MCP tool, or what the mobile app may queue offline.

## Rules

| Rule | Where it lives |
|---|---|
| `type` is `payable` or `receivable`. `currency_code` defaults to the workspace currency, any ISO 4217 code is allowed | `debts::service::create` |
| `amount > 0`, `0 <= remaining_amount <= amount`, at most four decimal places | `CHECK` constraints, `debts::service::validate_amount` |
| `status` is derived, never sent: `unpaid` when remaining = amount, `paid` at 0, `partial` between. A `CHECK` holds the three together | `domain::debt::status` |
| An edit may change `contact_id`, `description`, `due_date` and `amount`. An amount below what is already paid is `AMOUNT_BELOW_PAID` | `debts::service::update` |
| `type` and `currency_code` are fixed once a live payment exists: `DEBT_HAS_PAYMENTS` | `debts::service::update` |
| Deleting a debt with a live payment is `DEBT_HAS_PAYMENTS`. Cancel the payments first | `debts::service::delete` |
| A payment is `> 0` and `<=` the remaining amount, in the debt's currency: otherwise `PAYMENT_EXCEEDS_REMAINING` | `debts::service::pay` |
| A payment through a wallet writes one transaction: `expense` for a payable, `income` for a receivable, no category, `name` = the contact's name, `description` = the debt's, the payment's `date`. Without a wallet it writes none | `debts::service::pay` |
| Payment and transaction are one database transaction: wallet rows locked first (ascending id, D13), then debt rows (ascending id), then the remaining amount is read | `debts::service::pay`, `bulk_pay` |
| Cancelling a payment soft-deletes it and its transaction, reverses the balance and restores the remaining amount and status | `debts::service::cancel_payment` |
| Deleting a payment transaction by any route cancels its payment (D121) | `transactions::service::delete`, `bulk_delete`, `delete_item` callers |
| A payment transaction refuses a change to `amount`, `wallet_id`, `type`, `to_wallet_id`, `original_*` or `exchange_rate`: `PAYMENT_TRANSACTION_LOCKED`. Name, description, category, date, items and attachments stay editable: items move no money (TXN-12) | `transactions::service::update` |
| A debt made from a transaction keeps `origin = from_transaction`. Deleting the source clears `source_transaction_id`; the debt is untouched (D121) | `transactions::service::delete` |
| Deleting a contact with a live debt, paid or not, is `CONTACT_HAS_DEBTS` | `contacts::service::delete` |
| Merging contact A into B moves A's live debts to B and soft-deletes A, in one transaction | `contacts::service::merge` |
| Every write leaves an audit row in the same transaction: `contact.*`, `debt.created`, `debt.updated`, `debt.deleted`, `debt.paid`, `debt.payment_cancelled`, plus the transaction's own `transaction.created` or `transaction.deleted` | `audit::log` |
| Admins and owners write; members read (Role) | Auth extractor |

`remaining_amount` and `status` are stored, not computed per read, because the list filters and sorts on them. Only the debt service writes them, inside the payment's transaction.

## Payments in another currency

A debt in USD paid from an IDR wallet is a transaction entered in a foreign currency, which the ledger already handles ([TXN-20](../prd.md#64-transactions-txn), [multicurrency](../data-model.md#multicurrency)):

| Transaction column | Value |
|---|---|
| `original_amount`, `original_currency_code` | The payment amount and the debt's currency |
| `exchange_rate` | Prefilled by the same rate resolution as any transaction, editable in the payment sheet (D39) |
| `amount` | `original_amount × exchange_rate`, in the wallet's currency: what left or reached the wallet |

The person types the payment in the debt's currency and can correct the rate until the wallet amount matches what really moved. The remaining amount drops by the payment amount in the debt's currency. The tool amount cap ([D25](../security/ai-safety.md#layer-2-blast-radius)) applies to the wallet amount, as it does for any transaction a tool writes.

## Bulk pay

`POST /v1/debts/bulk-pay` pays 1 to 50 debts at once, each by an amount the sheet prefills with its remaining amount. One payment and one transaction per debt, all or nothing. With a wallet, every debt must be in the wallet's currency, otherwise `BULK_PAY_CURRENCY_MISMATCH`: a per-debt rate does not fit one sheet. The old app wrote one combined expense and one combined income, which made cancelling one payment impossible without touching the others (D121).

## Split bill

`POST /v1/debts/split` divides an expense equally between the person and N contacts and records a `receivable` per contact, `origin = from_transaction`. The source is an existing live `expense`, or a new one written from `wallet_id`, `amount`, `name`, `category_id` and `date` in the same transaction. Each share is `floor(amount / (N + 1))` to the currency's minor unit; the remainder stays with the person, so the shares never add up to more than was spent. Names are matched to live contacts case-insensitively after trimming, duplicates are dropped, and an unknown name creates a contact. 1 to 20 contacts.

As in the old app, split bill has no screen: it is a chat and MCP tool and an API route.

## The debts page

`/debts`, in the Finance group after Budget. The old page, ported exactly:

- **Cards**: Owed to you, You owe, Net position (each converted to the workspace currency as `GET /v1/wallets/totals` does, D117), and Overdue (a count, red when above 0). From `GET /v1/debts/summary`, every figure computed in the API (D27).
- **Header**: the filter bar (search on contact name and description; facets Status and Type) on the left, New debt on the right.
- **Table**: select, Type, Contact, Description, Summary (amount and remaining), Status, Due date, row menu (View details, Edit, Delete; Pay is in the detail sheet). Selecting rows shows the bulk edit bar: bulk pay and Delete.
- **Sheets**: debt form (type, amount with currency, contact with `<SelectContact creatable />`, due date, description), detail (figures, payments with Cancel, the source transaction), payment (amount, wallet optional, date, rate when currencies differ), bulk pay.
- **Empty states**: "No debts yet" with New debt; "No debts match" with Clear filters.

`?search=`, `?status=`, `?type=`, `?contact_id=`, `?sort=` (default `due_date`, no due date last), `?order=` and `?page=` live in the URL (UI-8). Overdue means `due_date` before the person's local date, which the page sends as `?today=`; the API has no workspace timezone to use, and falls back to the UTC date when a client sends none.

Elsewhere on the web: the overview shows the old Debt balance card (the summary's `net` and the open count) and its prompt chip, "Show my outstanding debts and receivables, including who owes whom and the remaining balances."; the transaction detail sheet lists related debts and payments and has Create debt, which opens the debt form with the transaction as its source.

## The contacts page

`/contacts`, after Debts. Cards: Total, Added this month, With email, With phone. Table: Name, Email, Phone, row menu (Edit, Merge into…, Delete); the old Website and Location columns go with their fields. Search covers name, email and phone. Form: name (required), email, phone, note. The detail sheet lists the contact's debts. The old address, VAT, website and billing fields are not carried: they served invoices, which stay out.

## Chat and MCP

| Tool | Chat | MCP | Notes |
|---|---|---|---|
| `get_outstanding_debts` | yes | yes | Unpaid and partial debts with contact, remaining and due date |
| `create_debt` | yes | yes | Contact by name, created when unknown |
| `pay_debt` | yes | yes | Debt id from `get_outstanding_debts`. In chat the wallet defaults to the default wallet, as in the old app; over MCP it is optional |
| `update_debt` | yes | yes | Contact, amount, description, due date |
| `delete_debt` | yes, confirmed turn | yes, `confirmed` | Counts against the one delete per turn |
| `split_bill` | yes, confirmed turn | yes, `confirmed` | Confirmed first, because it writes up to 20 debts and contacts at once (D122). The first call answers `CONFIRMATION_REQUIRED` with the API's split: each person and share, the remainder kept by the person, the contacts that would be created. One write once confirmed |
| `list_contacts`, `create_contact`, `update_contact` | no | yes | |
| `delete_contact`, `merge_contacts` | no | yes, `confirmed` | |

`create_debt`, `pay_debt` and `update_debt` count as writes against the per-turn cap; `pay_debt` with a wallet also counts as a transaction created. Contact names are written by people and reach the model as data, never as instructions ([AI safety](../security/ai-safety.md)). Every figure in a tool result is formatted by the API (D27).

## Mobile

Debts and contacts screens from the old Flutter app. Creating, editing and deleting debts and contacts, paying, cancelling a payment, and merging contacts queue offline like transactions (MOB-10). Every create carries a client `id` (D114), so a replay never pays twice; every `PATCH` carries `If-Match` (D115). A queued payment adds its wallet delta to the balance estimate. A replay refused by the API, for example `PAYMENT_EXCEEDS_REMAINING` because the debt was paid on the web meanwhile, marks the entry failed and shows the message in the sync banner.

## Not built

- The debt canvas in chat.
- Reminders or notifications for due dates.
- Interest, instalment schedules, or a debt in several currencies.
- A split that is not equal.
- Contact fields for invoices.
