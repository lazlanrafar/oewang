//! Debts, payments and split bills (DEBT-1 to DEBT-10, D120, D121).
//!
//! A payment through a wallet is an ordinary transaction written by the
//! ledger's own create path, inside the same database transaction as the
//! payment row and the debt's new remaining amount. Wallets are locked
//! first, by that create, and debts after, in ascending id order (D13).

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, NaiveDate, Utc};
use oewang_db::{
    repositories::{
        contacts,
        debts::{
            self as repo, DebtFilters, DebtListRow, DebtRow, DebtSort, DebtUpdate, NewDebt,
            NewPayment, PaymentDetailRow, PaymentRow,
        },
        transactions as ledger_repo, wallets,
    },
    PgPool,
};
use oewang_domain::{
    debt::{split_share, status},
    format_money,
    ledger::{round_money, TransactionType},
    validate_currency_code, AppError, Page, Result,
};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::{Postgres, Transaction};

use crate::{
    audit::{log, snapshot, Actor},
    contacts::service as contact_service,
    offline,
    transactions::service::{self as ledger, TransactionInput, TransactionRow},
};

const ENTITY: &str = "debt";
const PAYMENT_ENTITY: &str = "debt_payment";
/// The most debts one bulk pay may settle.
pub const BULK_LIMIT: usize = 50;
/// The most contacts one split may name.
pub const SPLIT_LIMIT: usize = 20;

// ------------------------------------------------------------------ reads

pub async fn list(
    pool: &PgPool,
    workspace_id: &str,
    filters: &DebtFilters<'_>,
    sort: DebtSort,
    descending: bool,
    page: Page,
) -> Result<(Vec<DebtListRow>, i64)> {
    tokio::try_join!(
        repo::list(
            pool,
            workspace_id,
            filters,
            sort,
            descending,
            i64::from(page.limit),
            page.offset()
        ),
        repo::count(pool, workspace_id, filters),
    )
    .map_err(internal)
}

pub async fn find(pool: &PgPool, workspace_id: &str, id: &str) -> Result<DebtListRow> {
    repo::find_detail(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::DebtNotFound)
}

pub async fn payments(
    pool: &PgPool,
    workspace_id: &str,
    id: &str,
) -> Result<Vec<PaymentDetailRow>> {
    repo::list_payments(pool, workspace_id, id)
        .await
        .map_err(internal)
}

/// The cards above the list, whatever its filters. Each currency's open
/// remainder converts to the workspace currency at the newest stored rate,
/// as the wallet totals do (D117); one with no rate is left out and counted.
#[derive(Debug, Serialize)]
pub struct DebtSummary {
    pub currency_code: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub owed_to_you: Decimal,
    pub owed_to_you_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub you_owe: Decimal,
    pub you_owe_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub net: Decimal,
    pub net_formatted: String,
    pub open_count: i64,
    pub overdue_count: i64,
    pub left_out: usize,
}

pub async fn summary(pool: &PgPool, workspace_id: &str, today: NaiveDate) -> Result<DebtSummary> {
    let (totals, overdue, open_count, (home, snapshot)) = tokio::try_join!(
        async {
            repo::open_totals(pool, workspace_id)
                .await
                .map_err(internal)
        },
        async {
            repo::overdue_count(pool, workspace_id, today)
                .await
                .map_err(internal)
        },
        async {
            repo::count(
                pool,
                workspace_id,
                &DebtFilters {
                    statuses: vec!["unpaid".into(), "partial".into()],
                    ..Default::default()
                },
            )
            .await
            .map_err(internal)
        },
        crate::fx::service::list_currencies(pool, workspace_id),
    )?;
    let rates: HashMap<String, Decimal> = snapshot
        .into_iter()
        .map(|row| (row.currency_code, row.rate))
        .collect();

    let mut owed_to_you = Decimal::ZERO;
    let mut you_owe = Decimal::ZERO;
    let mut left_out = 0;
    for row in totals {
        let value = if row.currency_code == home {
            Some(row.remaining)
        } else {
            rates
                .get(&row.currency_code)
                .map(|rate| round_money(row.remaining * rate))
        };
        match (value, row.r#type.as_str()) {
            (None, _) => left_out += 1,
            (Some(value), "receivable") => owed_to_you += value,
            (Some(value), _) => you_owe += value,
        }
    }
    let net = owed_to_you - you_owe;
    let money = |value: Decimal| format_money(value, &home, false);
    Ok(DebtSummary {
        owed_to_you_formatted: money(owed_to_you),
        owed_to_you,
        you_owe_formatted: money(you_owe),
        you_owe,
        net_formatted: format_money(net, &home, true),
        net,
        open_count,
        overdue_count: overdue,
        left_out,
        currency_code: home,
    })
}

/// What `GET /v1/transactions/{id}/debts` answers (DEBT-12).
pub async fn for_transaction(
    pool: &PgPool,
    workspace_id: &str,
    transaction_id: &str,
) -> Result<(Vec<DebtListRow>, Option<(PaymentRow, DebtListRow)>)> {
    ledger::find(pool, workspace_id, transaction_id).await?;
    let sourced = repo::list_for_source(pool, workspace_id, transaction_id)
        .await
        .map_err(internal)?;
    let ids = [transaction_id.to_string()];
    let payment = repo::payments_for_transactions(pool, workspace_id, &ids)
        .await
        .map_err(internal)?
        .into_iter()
        .next();
    let settled = match payment {
        Some(payment) => {
            let debt = find(pool, workspace_id, &payment.debt_id).await?;
            Some((payment, debt))
        }
        None => None,
    };
    Ok((sourced, settled))
}

// ----------------------------------------------------------- create, edit

pub struct DebtInput<'a> {
    pub kind: &'a str,
    pub contact_id: &'a str,
    pub amount: Decimal,
    pub currency_code: Option<&'a str>,
    pub due_date: Option<NaiveDate>,
    pub description: Option<&'a str>,
    pub source_transaction_id: Option<&'a str>,
}

/// The create `POST /v1/debts` runs, and whether this call made the row
/// (D114).
pub async fn create_with_id(
    pool: &PgPool,
    actor: Actor<'_>,
    id: Option<&str>,
    input: DebtInput<'_>,
) -> Result<(DebtListRow, bool)> {
    if let Some(id) = id {
        offline::validate_id(id)?;
        if offline::is_repeat(pool, actor.workspace_id, offline::DEBT, id).await? {
            return repeated(pool, actor.workspace_id, id).await;
        }
    }

    let kind = validate_kind(input.kind)?;
    let amount = validate_amount("amount", input.amount)?;
    let description = clean_description(input.description)?;

    // The source's wallet names the currency when none is given (DEBT-9).
    let source = match input.source_transaction_id {
        Some(source_id) => Some(
            ledger::find(pool, actor.workspace_id, source_id)
                .await
                .map_err(|_| AppError::TransactionNotFound)?,
        ),
        None => None,
    };
    let currency = match (input.currency_code, &source) {
        (Some(code), _) => validate_currency_code("currency_code", code)?,
        (None, Some(source)) => source.wallet_currency_code.clone(),
        (None, None) => workspace_currency(pool, actor.workspace_id).await?,
    };

    let id = id.map_or_else(cuid2::create_id, str::to_string);
    let mut tx = pool.begin().await.map_err(internal)?;
    contacts::find(&mut *tx, actor.workspace_id, input.contact_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ContactNotFound)?;

    let new = NewDebt {
        id: &id,
        workspace_id: actor.workspace_id,
        contact_id: input.contact_id,
        source_transaction_id: source.as_ref().map(|s| s.id.as_str()),
        kind,
        origin: if source.is_some() {
            "from_transaction"
        } else {
            "manual"
        },
        currency_code: &currency,
        amount,
        description: description.as_deref(),
        due_date: input.due_date,
    };
    let Some(debt) = repo::insert(&mut *tx, new).await.map_err(internal)? else {
        drop(tx);
        return repeated(pool, actor.workspace_id, &id).await;
    };
    log(
        &mut tx,
        actor,
        "debt.created",
        ENTITY,
        &debt.id,
        None,
        snapshot(&debt)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok((find(pool, actor.workspace_id, &debt.id).await?, true))
}

async fn repeated(pool: &PgPool, workspace_id: &str, id: &str) -> Result<(DebtListRow, bool)> {
    repo::find_with_deleted(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::IdTaken)?;
    // A repeat of a create whose debt was deleted since answers that it is
    // gone rather than bring it back.
    let debt = repo::find_detail(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::DebtNotFound)?;
    Ok((debt, false))
}

/// `None` leaves a field alone; `Some(None)` clears a nullable one.
#[derive(Default)]
pub struct DebtChange<'a> {
    pub contact_id: Option<&'a str>,
    pub kind: Option<&'a str>,
    pub currency_code: Option<&'a str>,
    pub amount: Option<Decimal>,
    pub description: Option<Option<&'a str>>,
    pub due_date: Option<Option<NaiveDate>>,
}

pub async fn update(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    change: DebtChange<'_>,
    if_match: Option<DateTime<Utc>>,
) -> Result<DebtListRow> {
    let kind = change.kind.map(validate_kind).transpose()?;
    let currency = change
        .currency_code
        .map(|code| validate_currency_code("currency_code", code))
        .transpose()?;
    let amount = change
        .amount
        .map(|a| validate_amount("amount", a))
        .transpose()?;
    let description = change.description.map(clean_description).transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;
    let Some(before) = repo::lock(&mut *tx, actor.workspace_id, &[id.to_string()])
        .await
        .map_err(internal)?
        .pop()
    else {
        let not_found = AppError::DebtNotFound;
        let kind = offline::DEBT;
        return Err(
            offline::missing(&mut *tx, actor.workspace_id, kind, id, if_match, not_found).await,
        );
    };
    offline::check(if_match, before.updated_at)?;

    let kind = kind.unwrap_or(&before.r#type);
    let currency = currency.unwrap_or_else(|| before.currency_code.clone());
    if (kind != before.r#type || currency != before.currency_code)
        && repo::has_live_payments(&mut *tx, actor.workspace_id, id)
            .await
            .map_err(internal)?
    {
        return Err(AppError::DebtHasPayments);
    }

    let contact_id = change.contact_id.unwrap_or(&before.contact_id);
    if contact_id != before.contact_id {
        contacts::find(&mut *tx, actor.workspace_id, contact_id)
            .await
            .map_err(internal)?
            .ok_or(AppError::ContactNotFound)?;
    }

    let amount = amount.unwrap_or(before.amount);
    let paid = before.amount - before.remaining_amount;
    if amount < paid {
        return Err(AppError::AmountBelowPaid);
    }
    let remaining = amount - paid;

    let row = DebtUpdate {
        contact_id,
        kind,
        currency_code: &currency,
        amount,
        remaining_amount: remaining,
        status: status(amount, remaining),
        description: match &description {
            Some(value) => value.as_deref(),
            None => before.description.as_deref(),
        },
        due_date: change.due_date.unwrap_or(before.due_date),
    };
    let after = repo::update(&mut *tx, actor.workspace_id, id, &row, if_match)
        .await
        .map_err(internal)?
        .ok_or(match if_match {
            Some(_) => AppError::Stale(None),
            None => AppError::DebtNotFound,
        })?;
    log(
        &mut tx,
        actor,
        "debt.updated",
        ENTITY,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    find(pool, actor.workspace_id, id).await
}

/// Refused while a live payment exists: cancel the payments first, which
/// puts their money back where it came from (DEBT-3).
pub async fn delete(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let before = repo::lock(&mut *tx, actor.workspace_id, &[id.to_string()])
        .await
        .map_err(internal)?
        .pop()
        .ok_or(AppError::DebtNotFound)?;
    if repo::has_live_payments(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::DebtHasPayments);
    }
    repo::soft_delete(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "debt.deleted",
        ENTITY,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(())
}

// ---------------------------------------------------------------- payments

pub struct PayInput<'a> {
    pub amount: Decimal,
    pub wallet_id: Option<&'a str>,
    pub date: DateTime<Utc>,
    /// Debt currency to wallet currency, when they differ. Resolved like any
    /// transaction's rate when absent.
    pub exchange_rate: Option<Decimal>,
}

/// One payment as the routes answer it.
#[derive(Debug)]
pub struct Paid {
    pub payment: PaymentRow,
    pub debt: DebtListRow,
    pub transaction: Option<ledger::TransactionListRow>,
}

/// Pay a debt (DEBT-4, DEBT-5). With a client `id` that already names a
/// payment of this workspace nothing is written, so a replay never pays
/// twice (D114).
pub async fn pay(
    pool: &PgPool,
    actor: Actor<'_>,
    debt_id: &str,
    id: Option<&str>,
    input: PayInput<'_>,
) -> Result<(Paid, bool)> {
    if let Some(id) = id {
        offline::validate_id(id)?;
        if offline::is_repeat(pool, actor.workspace_id, offline::DEBT_PAYMENT, id).await? {
            return Ok((repeated_payment(pool, actor.workspace_id, id).await?, false));
        }
    }
    let amount = validate_amount("amount", input.amount)?;
    let debt = find(pool, actor.workspace_id, debt_id).await?;

    let planned = match input.wallet_id {
        Some(wallet_id) => Some(
            plan_transaction(
                pool,
                actor,
                &debt,
                amount,
                wallet_id,
                input.date,
                input.exchange_rate,
            )
            .await?,
        ),
        None => None,
    };

    let id = id.map_or_else(cuid2::create_id, str::to_string);
    let mut tx = pool.begin().await.map_err(internal)?;
    let transaction = match &planned {
        Some(plan) => {
            Some(ledger::write_created(&mut tx, actor, &plan.input(), &plan.prepared).await?)
        }
        None => None,
    };

    let locked = repo::lock(&mut *tx, actor.workspace_id, &[debt_id.to_string()])
        .await
        .map_err(internal)?
        .pop()
        .ok_or(AppError::DebtNotFound)?;
    // The transaction was planned from the debt as read before the lock.
    if locked.r#type != debt.r#type || locked.currency_code != debt.currency_code {
        return Err(AppError::Stale(None));
    }
    let Some(payment) = settle(
        &mut tx,
        actor,
        &id,
        &locked,
        amount,
        input.date,
        transaction.as_ref(),
    )
    .await?
    else {
        // A concurrent payment with the same id committed first.
        drop(tx);
        return Ok((
            repeated_payment(pool, actor.workspace_id, &id).await?,
            false,
        ));
    };
    tx.commit().await.map_err(internal)?;

    Ok((paid(pool, actor.workspace_id, payment).await?, true))
}

/// Record one payment on a debt whose row the caller has locked: the
/// payment row, the new remaining amount, and an audit row for each.
/// `None` when the payment id is already taken.
async fn settle(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    id: &str,
    debt: &DebtRow,
    amount: Decimal,
    date: DateTime<Utc>,
    transaction: Option<&TransactionRow>,
) -> Result<Option<PaymentRow>> {
    if amount > debt.remaining_amount {
        return Err(AppError::PaymentExceedsRemaining);
    }
    let new = NewPayment {
        id,
        workspace_id: actor.workspace_id,
        debt_id: &debt.id,
        transaction_id: transaction.map(|t| t.id.as_str()),
        amount,
        date,
    };
    let Some(payment) = repo::insert_payment(&mut **tx, new)
        .await
        .map_err(internal)?
    else {
        return Ok(None);
    };
    let remaining = debt.remaining_amount - amount;
    let after = repo::set_remaining(
        &mut **tx,
        actor.workspace_id,
        &debt.id,
        remaining,
        status(debt.amount, remaining),
    )
    .await
    .map_err(internal)?;
    log(
        tx,
        actor,
        "debt.paid",
        PAYMENT_ENTITY,
        &payment.id,
        None,
        snapshot(&payment)?,
    )
    .await?;
    log(
        tx,
        actor,
        "debt.updated",
        ENTITY,
        &debt.id,
        snapshot(debt)?,
        snapshot(&after)?,
    )
    .await?;
    Ok(Some(payment))
}

async fn repeated_payment(pool: &PgPool, workspace_id: &str, id: &str) -> Result<Paid> {
    let payment = repo::find_payment_with_deleted(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::IdTaken)?;
    paid(pool, workspace_id, payment).await
}

async fn paid(pool: &PgPool, workspace_id: &str, payment: PaymentRow) -> Result<Paid> {
    let debt = repo::find_detail(pool, workspace_id, &payment.debt_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::DebtNotFound)?;
    let transaction = match &payment.transaction_id {
        Some(tx_id) => ledger_repo::find_detail(pool, workspace_id, tx_id, true)
            .await
            .map_err(internal)?,
        None => None,
    };
    Ok(Paid {
        payment,
        debt,
        transaction,
    })
}

/// A payment's transaction, worked out before the write opens, because the
/// rate may need a lookup and no lookup belongs inside a lock.
struct PlannedTransaction {
    fields: TransactionFields,
    prepared: ledger::Prepared,
}

impl PlannedTransaction {
    fn input(&self) -> TransactionInput<'_> {
        self.fields.input()
    }
}

struct TransactionFields {
    kind: TransactionType,
    wallet_id: String,
    amount: Decimal,
    original: Option<(Decimal, String, Decimal)>,
    date: DateTime<Utc>,
    name: String,
    description: Option<String>,
}

impl TransactionFields {
    fn input(&self) -> TransactionInput<'_> {
        TransactionInput {
            kind: self.kind,
            wallet_id: &self.wallet_id,
            to_wallet_id: None,
            category_id: None,
            amount: self.amount,
            to_amount: None,
            original_amount: self.original.as_ref().map(|o| o.0),
            original_currency_code: self.original.as_ref().map(|o| o.1.as_str()),
            exchange_rate: self.original.as_ref().map(|o| o.2),
            requested_base_rate: None,
            date: self.date,
            name: Some(&self.name),
            description: self.description.as_deref(),
            attachment_ids: None,
        }
    }
}

/// `expense` for a payable, `income` for a receivable, in the wallet's
/// currency. A debt in another currency is the transaction's foreign entry:
/// the payment is its original amount (DEBT-5, TXN-20).
async fn plan_transaction(
    pool: &PgPool,
    actor: Actor<'_>,
    debt: &DebtListRow,
    amount: Decimal,
    wallet_id: &str,
    date: DateTime<Utc>,
    exchange_rate: Option<Decimal>,
) -> Result<PlannedTransaction> {
    let wallet = wallets::find_wallet(pool, actor.workspace_id, wallet_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    let (wallet_amount, original) = if wallet.currency_code == debt.currency_code {
        (amount, None)
    } else {
        let rate = crate::fx::service::resolve(
            pool,
            &debt.currency_code,
            &wallet.currency_code,
            date.date_naive(),
            exchange_rate,
        )
        .await?
        .rate;
        (
            round_money(amount * rate),
            Some((amount, debt.currency_code.clone(), rate)),
        )
    };

    let fields = TransactionFields {
        kind: if debt.r#type == "payable" {
            TransactionType::Expense
        } else {
            TransactionType::Income
        },
        wallet_id: wallet.id,
        amount: wallet_amount,
        original,
        date,
        name: debt.contact_name.clone(),
        description: debt.description.clone(),
    };
    let prepared = ledger::prepare(pool, actor.workspace_id, &fields.input()).await?;
    Ok(PlannedTransaction { fields, prepared })
}

/// Cancel a payment (DEBT-7). With a transaction, the transaction's own
/// delete does it, so cancelling here and deleting on the transactions page
/// are the same act (D121).
pub async fn cancel_payment(
    pool: &PgPool,
    actor: Actor<'_>,
    debt_id: &str,
    payment_id: &str,
) -> Result<()> {
    let payment = repo::find_payment(pool, actor.workspace_id, payment_id)
        .await
        .map_err(internal)?
        .filter(|payment| payment.debt_id == debt_id)
        .ok_or(AppError::PaymentNotFound)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    match &payment.transaction_id {
        Some(transaction_id) => ledger::delete_in(&mut tx, actor, transaction_id).await?,
        None => cancel(&mut tx, actor, &[payment]).await?,
    }
    tx.commit().await.map_err(internal)?;
    Ok(())
}

/// The other half of deleting transactions (D121): cancel the payments they
/// settled and clear the link of the debts made from them. Called by every
/// transaction delete, on its transaction, after the wallets are locked.
pub(crate) async fn release_transactions(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    transaction_ids: &[String],
) -> Result<()> {
    let payments = repo::payments_for_transactions(&mut **tx, actor.workspace_id, transaction_ids)
        .await
        .map_err(internal)?;
    cancel(tx, actor, &payments).await?;

    let before: HashMap<String, DebtRow> =
        repo::lock_by_source(&mut **tx, actor.workspace_id, transaction_ids)
            .await
            .map_err(internal)?
            .into_iter()
            .map(|debt| (debt.id.clone(), debt))
            .collect();
    if before.is_empty() {
        return Ok(());
    }
    let cleared = repo::clear_source(&mut **tx, actor.workspace_id, transaction_ids)
        .await
        .map_err(internal)?;
    for debt in &cleared {
        let old = before.get(&debt.id).map(snapshot).transpose()?.flatten();
        log(
            tx,
            actor,
            "debt.updated",
            ENTITY,
            &debt.id,
            old,
            snapshot(debt)?,
        )
        .await?;
    }
    Ok(())
}

/// Soft-delete these payments and give each debt its money back. The debts
/// are locked in ascending id order.
async fn cancel(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    payments: &[PaymentRow],
) -> Result<()> {
    if payments.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = payments.iter().map(|p| p.debt_id.clone()).collect();
    let mut debts: HashMap<String, DebtRow> = repo::lock(&mut **tx, actor.workspace_id, &ids)
        .await
        .map_err(internal)?
        .into_iter()
        .map(|debt| (debt.id.clone(), debt))
        .collect();

    for payment in payments {
        repo::soft_delete_payment(&mut **tx, actor.workspace_id, &payment.id)
            .await
            .map_err(internal)?;
        log(
            tx,
            actor,
            "debt.payment_cancelled",
            PAYMENT_ENTITY,
            &payment.id,
            snapshot(payment)?,
            None,
        )
        .await?;

        // A payment on a deleted debt cannot exist: the debt delete is
        // refused while it is live.
        let Some(before) = debts.get(&payment.debt_id).cloned() else {
            continue;
        };
        let remaining = (before.remaining_amount + payment.amount).min(before.amount);
        let after = repo::set_remaining(
            &mut **tx,
            actor.workspace_id,
            &before.id,
            remaining,
            status(before.amount, remaining),
        )
        .await
        .map_err(internal)?;
        log(
            tx,
            actor,
            "debt.updated",
            ENTITY,
            &before.id,
            snapshot(&before)?,
            snapshot(&after)?,
        )
        .await?;
        debts.insert(after.id.clone(), after);
    }
    Ok(())
}

// ---------------------------------------------------------------- bulk pay

pub struct BulkItem<'a> {
    pub id: Option<&'a str>,
    pub debt_id: &'a str,
    pub amount: Decimal,
}

/// Pay several debts at once, all or nothing, one payment and one
/// transaction per debt (DEBT-6). Every id given already taken means this
/// is a replay, answered with what the first call wrote.
pub async fn bulk_pay(
    pool: &PgPool,
    actor: Actor<'_>,
    wallet_id: Option<&str>,
    date: DateTime<Utc>,
    items: &[BulkItem<'_>],
) -> Result<(Vec<Paid>, bool)> {
    if items.is_empty() || items.len() > BULK_LIMIT {
        return Err(AppError::validation([(
            "payments",
            "Pay 1 to 50 debts at once.",
        )]));
    }

    let mut repeats = 0;
    for item in items {
        if let Some(id) = item.id {
            offline::validate_id(id)?;
            if offline::is_repeat(pool, actor.workspace_id, offline::DEBT_PAYMENT, id).await? {
                repeats += 1;
            }
        }
    }
    if repeats > 0 {
        if repeats != items.len() {
            return Err(AppError::IdTaken);
        }
        let mut answered = Vec::with_capacity(items.len());
        for item in items {
            answered.push(
                repeated_payment(pool, actor.workspace_id, item.id.unwrap_or_default()).await?,
            );
        }
        return Ok((answered, false));
    }

    let mut plans = Vec::with_capacity(items.len());
    for item in items {
        let amount = validate_amount("amount", item.amount)?;
        let debt = find(pool, actor.workspace_id, item.debt_id).await?;
        let plan = match wallet_id {
            Some(wallet_id) => {
                let wallet = wallets::find_wallet(pool, actor.workspace_id, wallet_id)
                    .await
                    .map_err(internal)?
                    .ok_or(AppError::WalletNotFound)?;
                if wallet.currency_code != debt.currency_code {
                    return Err(AppError::BulkPayCurrencyMismatch);
                }
                Some(plan_transaction(pool, actor, &debt, amount, wallet_id, date, None).await?)
            }
            None => None,
        };
        plans.push((amount, plan));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    // Every transaction first: they lock the one wallet. Then the debts.
    let mut written = Vec::with_capacity(items.len());
    for (_, plan) in &plans {
        written.push(match plan {
            Some(plan) => {
                Some(ledger::write_created(&mut tx, actor, &plan.input(), &plan.prepared).await?)
            }
            None => None,
        });
    }

    let ids: Vec<String> = items.iter().map(|item| item.debt_id.to_string()).collect();
    let mut debts: HashMap<String, DebtRow> = repo::lock(&mut *tx, actor.workspace_id, &ids)
        .await
        .map_err(internal)?
        .into_iter()
        .map(|debt| (debt.id.clone(), debt))
        .collect();

    let mut payments = Vec::with_capacity(items.len());
    for ((item, (amount, _)), transaction) in items.iter().zip(&plans).zip(&written) {
        let debt = debts
            .get(item.debt_id)
            .cloned()
            .ok_or(AppError::DebtNotFound)?;
        let id = item.id.map_or_else(cuid2::create_id, str::to_string);
        let payment = settle(
            &mut tx,
            actor,
            &id,
            &debt,
            *amount,
            date,
            transaction.as_ref(),
        )
        .await?
        .ok_or(AppError::IdTaken)?;
        // The same debt twice in one call pays from what the first left.
        let mut after = debt;
        after.remaining_amount -= amount;
        debts.insert(after.id.clone(), after);
        payments.push(payment);
    }
    tx.commit().await.map_err(internal)?;

    let mut answered = Vec::with_capacity(payments.len());
    for payment in payments {
        answered.push(paid(pool, actor.workspace_id, payment).await?);
    }
    Ok((answered, true))
}

// ------------------------------------------------------------------- split

pub struct NewExpense<'a> {
    pub wallet_id: &'a str,
    pub amount: Decimal,
    pub name: &'a str,
    pub category_id: Option<&'a str>,
    pub date: DateTime<Utc>,
}

pub enum SplitSource<'a> {
    Existing(&'a str),
    New(NewExpense<'a>),
}

/// Divide an expense equally between the person and their contacts and
/// record a receivable per contact (DEBT-10). Each share is floored to the
/// currency's minor unit, so the shares never add up to more than was spent.
pub async fn split(
    pool: &PgPool,
    actor: Actor<'_>,
    source: SplitSource<'_>,
    contact_ids: &[String],
    contact_names: &[String],
) -> Result<(ledger::TransactionListRow, Vec<DebtListRow>)> {
    let (ids, names) = split_people(contact_ids, contact_names)?;

    // Worked out before the write opens: the source, its currency, and the
    // new expense's rate.
    enum Planned<'a> {
        Existing(ledger::TransactionListRow),
        New(TransactionInput<'a>, ledger::Prepared),
    }
    let planned = match &source {
        SplitSource::Existing(id) => {
            let row = ledger::find(pool, actor.workspace_id, id).await?;
            if row.r#type != "expense" {
                return Err(AppError::SplitSourceNotExpense);
            }
            Planned::Existing(row)
        }
        SplitSource::New(expense) => {
            let amount = validate_amount("amount", expense.amount)?;
            let input = TransactionInput {
                kind: TransactionType::Expense,
                wallet_id: expense.wallet_id,
                to_wallet_id: None,
                category_id: expense.category_id,
                amount,
                to_amount: None,
                original_amount: None,
                original_currency_code: None,
                exchange_rate: None,
                requested_base_rate: None,
                date: expense.date,
                name: Some(expense.name),
                description: None,
                attachment_ids: None,
            };
            let prepared = ledger::prepare(pool, actor.workspace_id, &input).await?;
            Planned::New(input, prepared)
        }
    };

    let mut tx = pool.begin().await.map_err(internal)?;
    let (transaction_id, amount, currency, name) = match &planned {
        Planned::Existing(row) => (
            row.id.clone(),
            row.amount,
            row.wallet_currency_code.clone(),
            row.name.clone(),
        ),
        Planned::New(input, prepared) => {
            let row = ledger::write_created(&mut tx, actor, input, prepared).await?;
            let currency = wallets::find_wallet(&mut *tx, actor.workspace_id, &row.wallet_id)
                .await
                .map_err(internal)?
                .ok_or(AppError::WalletNotFound)?
                .currency_code;
            (row.id, row.amount, currency, row.name)
        }
    };

    let mut people = Vec::new();
    let mut chosen = HashSet::new();
    for id in ids {
        let contact = contacts::find(&mut *tx, actor.workspace_id, id)
            .await
            .map_err(internal)?
            .ok_or(AppError::ContactNotFound)?;
        if chosen.insert(contact.id.clone()) {
            people.push(contact);
        }
    }
    for name in names {
        let contact = contact_service::find_or_create(&mut tx, actor, name).await?;
        if chosen.insert(contact.id.clone()) {
            people.push(contact);
        }
    }

    let share = split_share(amount, people.len(), &currency);
    if share <= Decimal::ZERO {
        return Err(AppError::validation([(
            "amount",
            "That amount is too small to split.",
        )]));
    }

    let mut created = Vec::with_capacity(people.len());
    for contact in &people {
        let id = cuid2::create_id();
        let new = NewDebt {
            id: &id,
            workspace_id: actor.workspace_id,
            contact_id: &contact.id,
            source_transaction_id: Some(&transaction_id),
            kind: "receivable",
            origin: "from_transaction",
            currency_code: &currency,
            amount: share,
            description: name.as_deref(),
            due_date: None,
        };
        let debt = repo::insert(&mut *tx, new)
            .await
            .map_err(internal)?
            .ok_or_else(|| {
                AppError::Internal(anyhow::anyhow!("a generated id was already taken"))
            })?;
        log(
            &mut tx,
            actor,
            "debt.created",
            ENTITY,
            &debt.id,
            None,
            snapshot(&debt)?,
        )
        .await?;
        created.push(debt.id);
    }
    tx.commit().await.map_err(internal)?;

    let transaction = ledger::find(pool, actor.workspace_id, &transaction_id).await?;
    let mut debts = Vec::with_capacity(created.len());
    for id in created {
        debts.push(find(pool, actor.workspace_id, &id).await?);
    }
    Ok((transaction, debts))
}

/// The people a split names, trimmed and without repeats (a name compared
/// case-insensitively), 1 to [`SPLIT_LIMIT`] of them.
fn split_people<'a>(
    contact_ids: &'a [String],
    contact_names: &'a [String],
) -> Result<(Vec<&'a str>, Vec<&'a str>)> {
    let mut seen_ids = HashSet::new();
    let ids: Vec<&str> = contact_ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty() && seen_ids.insert(id.to_string()))
        .collect();
    let mut seen_names = HashSet::new();
    let names: Vec<&str> = contact_names
        .iter()
        .map(|name| name.trim())
        .filter(|name| !name.is_empty() && seen_names.insert(name.to_lowercase()))
        .collect();
    if ids.len() + names.len() == 0 || ids.len() + names.len() > SPLIT_LIMIT {
        return Err(AppError::validation([(
            "contact_names",
            "Split with 1 to 20 people.",
        )]));
    }
    Ok((ids, names))
}

/// What [`split`] would write, read without writing anything: the shown
/// half of a confirmed split (D122). Every figure is computed here (D27).
#[derive(Debug, Serialize)]
pub struct SplitPreview {
    pub currency_code: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub amount_formatted: String,
    /// Each other person's share.
    #[serde(with = "rust_decimal::serde::str")]
    pub share: Decimal,
    pub share_formatted: String,
    /// What the person keeps: their own share plus the remainder.
    #[serde(with = "rust_decimal::serde::str")]
    pub yours: Decimal,
    pub yours_formatted: String,
    pub people: Vec<SplitPerson>,
}

impl SplitPreview {
    /// The people as one line for a confirmation: "Ani, Budi (new contact)".
    pub fn people_line(&self) -> String {
        self.people
            .iter()
            .map(|person| {
                if person.is_new {
                    format!("{} (new contact)", person.name)
                } else {
                    person.name.clone()
                }
            })
            .collect::<Vec<_>>()
            .join(", ")
    }
}

#[derive(Debug, Serialize)]
pub struct SplitPerson {
    pub name: String,
    /// No live contact has this name, so the split would create one.
    pub is_new: bool,
}

pub async fn preview_split(
    pool: &PgPool,
    workspace_id: &str,
    source: &SplitSource<'_>,
    contact_ids: &[String],
    contact_names: &[String],
) -> Result<SplitPreview> {
    let (ids, names) = split_people(contact_ids, contact_names)?;

    let (amount, currency) = match source {
        SplitSource::Existing(id) => {
            let row = ledger::find(pool, workspace_id, id).await?;
            if row.r#type != "expense" {
                return Err(AppError::SplitSourceNotExpense);
            }
            (row.amount, row.wallet_currency_code)
        }
        SplitSource::New(expense) => {
            let amount = validate_amount("amount", expense.amount)?;
            let wallet = wallets::find_wallet(pool, workspace_id, expense.wallet_id)
                .await
                .map_err(internal)?
                .ok_or(AppError::WalletNotFound)?;
            (amount, wallet.currency_code)
        }
    };

    // The same matching `split` does, so the preview names who it would.
    let mut people = Vec::new();
    let mut chosen = HashSet::new();
    for id in ids {
        let contact = contacts::find(pool, workspace_id, id)
            .await
            .map_err(internal)?
            .ok_or(AppError::ContactNotFound)?;
        if chosen.insert(contact.id.clone()) {
            people.push(SplitPerson {
                name: contact.name,
                is_new: false,
            });
        }
    }
    for name in names {
        match contacts::find_by_name(pool, workspace_id, name)
            .await
            .map_err(internal)?
        {
            Some(contact) if chosen.insert(contact.id.clone()) => people.push(SplitPerson {
                name: contact.name,
                is_new: false,
            }),
            Some(_) => {}
            None => people.push(SplitPerson {
                name: name.to_string(),
                is_new: true,
            }),
        }
    }

    let share = split_share(amount, people.len(), &currency);
    if share <= Decimal::ZERO {
        return Err(AppError::validation([(
            "amount",
            "That amount is too small to split.",
        )]));
    }
    let yours = amount - share * Decimal::from(people.len());

    Ok(SplitPreview {
        amount_formatted: format_money(amount, &currency, false),
        share_formatted: format_money(share, &currency, false),
        yours_formatted: format_money(yours, &currency, false),
        currency_code: currency,
        amount,
        share,
        yours,
        people,
    })
}

// ----------------------------------------------------------------- helpers

fn validate_kind(raw: &str) -> Result<&'static str> {
    match raw.trim() {
        "payable" => Ok("payable"),
        "receivable" => Ok("receivable"),
        _ => Err(AppError::validation([(
            "type",
            "Use payable or receivable.",
        )])),
    }
}

/// Above zero, at most four decimal places, and below the point where a
/// typo is likelier than a debt.
fn validate_amount(field: &'static str, amount: Decimal) -> Result<Decimal> {
    if amount <= Decimal::ZERO {
        return Err(AppError::validation([(
            field,
            "Enter an amount above zero.",
        )]));
    }
    if amount > Decimal::new(100_000_000_000_000, 0) {
        return Err(AppError::validation([(field, "That amount is too large.")]));
    }
    if amount.round_dp(4) != amount {
        return Err(AppError::validation([(
            field,
            "Use at most four decimal places.",
        )]));
    }
    Ok(amount)
}

fn clean_description(raw: Option<&str>) -> Result<Option<String>> {
    match raw.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some(value) if value.chars().count() > 500 => Err(AppError::validation([(
            "description",
            "Use at most 500 characters.",
        )])),
        Some(value) => Ok(Some(value.to_string())),
    }
}

async fn workspace_currency(pool: &PgPool, workspace_id: &str) -> Result<String> {
    oewang_db::repositories::accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .map(|workspace| workspace.currency_code)
        .ok_or(AppError::NotFound)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
