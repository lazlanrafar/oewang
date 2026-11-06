//! The ledger's rules.
//!
//! Three things happen together or not at all, inside one database
//! transaction: the row is written, every affected wallet balance moves, and
//! an audit row records it (TXN-3, TXN-6, D13, D14).
//!
//! Rate resolution happens *before* the transaction opens, because it may
//! call a third party and no network call belongs inside an open
//! transaction.

use chrono::{DateTime, NaiveDate, Utc};
use oewang_db::{
    repositories::{accounts, audit, categories, transactions as repo, vault, wallets},
    PgPool,
};
use oewang_domain::{
    csv_import::{transform, ColumnMapping, RawRow},
    ledger::{
        fingerprint, net, reverse, round_money, BalanceDelta, ForeignEntry, ProposedShape,
        TransactionShape, TransactionType,
    },
    AppError, Result,
};
use rust_decimal::Decimal;
use sqlx::{Postgres, Transaction};

use crate::{
    audit::{log, snapshot, Actor},
    fx,
};

pub use oewang_db::repositories::transactions::{
    CategoryTotalRow, SortField, SortOrder, SummaryRow, TransactionFilters, TransactionListRow,
    TransactionRow,
};

const ENTITY: &str = "transaction";

/// The most rows one bulk edit or bulk delete may touch (TXN-14).
pub const BULK_LIMIT: usize = 500;
/// The most rows one import may commit (TXN-11).
/// The default, and the number the documentation states. The running
/// value is `Config::import_row_limit`; this is what it falls back to
/// and what the tests assert against
/// (docs/security/hardening.md#limits).
pub const IMPORT_LIMIT: usize = 5_000;

/// What a create or an update is asked to write.
///
/// `base_amount` is absent by design: it is always computed. `base_rate` is
/// absent too; a rate the user confirmed arrives as `requested_base_rate`
/// and goes through the resolution ladder rather than straight into the
/// column (D39, TXN-22).
#[derive(Debug, Clone)]
pub struct TransactionInput<'a> {
    pub kind: TransactionType,
    pub wallet_id: &'a str,
    pub to_wallet_id: Option<&'a str>,
    pub category_id: Option<&'a str>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
    /// The three foreign-entry columns: what the user typed, in what
    /// currency, at what rate to the wallet's currency.
    pub original_amount: Option<Decimal>,
    pub original_currency_code: Option<&'a str>,
    pub exchange_rate: Option<Decimal>,
    /// The wallet-to-workspace rate the user saw and confirmed in the form.
    /// A suggestion to the ladder, not a value written as given.
    pub requested_base_rate: Option<Decimal>,
    pub date: DateTime<Utc>,
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub is_ready: bool,
    /// The files this transaction carries (TXN-13, VLT-5).
    ///
    /// `None` leaves the attachments alone, which is what an import and a
    /// bulk edit want. `Some` is the whole set: anything not listed is
    /// detached, and the file itself is never deleted.
    pub attachment_ids: Option<&'a [String]>,
}

/// Everything the service worked out before it opened a transaction.
struct Prepared {
    shape: TransactionShape,
    foreign: Option<ForeignEntry>,
    /// What the source wallet's balance is denominated in. Carried here
    /// because the import fingerprint needs the row's currency and the
    /// wallet is not read again after this point.
    wallet_currency: String,
    base_rate: Decimal,
    base_amount: Decimal,
    base_rate_source: &'static str,
    base_rate_date: NaiveDate,
}

// ------------------------------------------------------------------- reads

/// Pagination lives beside the envelope it is reported in, so the clamp
/// exists once for every list route.
pub use oewang_domain::Page;

pub async fn list(
    pool: &PgPool,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
    sort: SortField,
    order: SortOrder,
    page: Page,
) -> Result<(Vec<TransactionListRow>, i64)> {
    // Two statements rather than a window function: the count is the cheap
    // one and skipping the join keeps it that way.
    let rows = repo::list(
        pool,
        workspace_id,
        filters,
        sort,
        order,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;

    let total = repo::count(pool, workspace_id, filters)
        .await
        .map_err(internal)?;

    Ok((rows, total))
}

pub async fn find(pool: &PgPool, workspace_id: &str, id: &str) -> Result<TransactionListRow> {
    repo::find_detail(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::TransactionNotFound)
}

pub async fn summary(
    pool: &PgPool,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
) -> Result<(Vec<SummaryRow>, Vec<CategoryTotalRow>)> {
    let by_type = repo::summary(pool, workspace_id, filters)
        .await
        .map_err(internal)?;
    let by_category = repo::summary_by_category(pool, workspace_id, filters)
        .await
        .map_err(internal)?;

    Ok((by_type, by_category))
}

/// The audit trail for one row, newest first (OPS-8).
///
/// Readable by any member: knowing why a number is what it is is not a
/// privileged question.
pub async fn history(pool: &PgPool, workspace_id: &str, id: &str) -> Result<Vec<audit::AuditRow>> {
    // Scoped through the transaction itself, so a history request cannot be
    // used to probe for ids in another workspace.
    find(pool, workspace_id, id).await?;

    audit::list_for_entity(pool, workspace_id, ENTITY, id)
        .await
        .map_err(internal)
}

// ------------------------------------------------------------------ create

pub async fn create(
    pool: &PgPool,
    actor: Actor<'_>,
    input: TransactionInput<'_>,
) -> Result<TransactionRow> {
    create_with_items(pool, actor, input, &[]).await
}

/// Create a transaction and its line items in one database transaction.
///
/// A receipt is the reason this exists. Confirming one is a single act by
/// the user, and creating the transaction and then adding six items in six
/// more calls makes it six acts that can each half-fail: a crash after the
/// third leaves a transaction whose items do not add up and nothing saying
/// why. Either the whole receipt is written or none of it is.
///
/// Items move no money. Only the transaction's own `amount` does, which is
/// why the balance arithmetic below does not look at them (TXN-12).
pub async fn create_with_items(
    pool: &PgPool,
    actor: Actor<'_>,
    input: TransactionInput<'_>,
    items: &[ItemInput<'_>],
) -> Result<TransactionRow> {
    for item in items {
        validate_item(item)?;
    }

    let prepared = prepare(pool, actor.workspace_id, &input).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let moves = net(prepared.shape.effect());
    apply_moves(&mut tx, actor.workspace_id, &moves).await?;

    let row = repo::insert(
        &mut *tx,
        new_row(&cuid2::create_id(), actor, &input, &prepared, None),
    )
    .await
    .map_err(internal)?;

    sync_attachments(&mut tx, actor.workspace_id, &row.id, input.attachment_ids).await?;

    for item in items {
        if let Some(category_id) = item.category_id {
            require_category(&mut tx, actor.workspace_id, category_id).await?;
        }

        let stored = vault::insert_item(
            &mut *tx,
            new_item(&cuid2::create_id(), actor.workspace_id, &row.id, item),
        )
        .await
        .map_err(internal)?;

        log(
            &mut tx,
            actor,
            "transaction_item.created",
            ITEM_ENTITY,
            &stored.id,
            None,
            snapshot(&stored)?,
        )
        .await?;
    }

    log(
        &mut tx,
        actor,
        "transaction.created",
        ENTITY,
        &row.id,
        None,
        snapshot(&row)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(row)
}

// ------------------------------------------------------------------ update

/// Reverse the old effect, apply the new one, atomically (TXN-4).
///
/// All nine type transitions, plus a changed amount, wallet or destination,
/// go through this one path: there is no per-transition branch, because
/// reversal is the negation of an effect and nothing else.
pub async fn update(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    input: TransactionInput<'_>,
) -> Result<TransactionRow> {
    let prepared = prepare(pool, actor.workspace_id, &input).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let before = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::TransactionNotFound)?;

    let old_effect = effect_of(&before)?;
    let moves = net(reverse(&old_effect)
        .into_iter()
        .chain(prepared.shape.effect()));
    apply_moves(&mut tx, actor.workspace_id, &moves).await?;

    let after = repo::update(
        &mut *tx,
        actor.workspace_id,
        id,
        new_row(id, actor, &input, &prepared, before.fingerprint.as_deref()),
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::TransactionNotFound)?;

    sync_attachments(&mut tx, actor.workspace_id, id, input.attachment_ids).await?;

    log(
        &mut tx,
        actor,
        "transaction.updated",
        ENTITY,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Make the join rows match the set the client sent (TXN-13).
///
/// A file that is no longer listed has its join row soft-deleted, never
/// the file: the same receipt may be attached to another transaction, and
/// removing an attachment is not deleting a document (VLT-5).
async fn sync_attachments(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    transaction_id: &str,
    attachment_ids: Option<&[String]>,
) -> Result<()> {
    let Some(ids) = attachment_ids else {
        return Ok(());
    };

    for file_id in ids {
        // A file from another workspace is a file that does not exist.
        vault::find_file(&mut **tx, workspace_id, file_id)
            .await
            .map_err(internal)?
            .ok_or(AppError::FileNotFound)?;

        vault::attach_file(
            &mut **tx,
            &cuid2::create_id(),
            workspace_id,
            transaction_id,
            file_id,
        )
        .await
        .map_err(internal)?;
    }

    vault::detach_others(&mut **tx, workspace_id, transaction_id, ids)
        .await
        .map_err(internal)?;

    Ok(())
}

// ------------------------------------------------------------------ delete

/// Soft delete, reversing the balance it moved (TXN-5).
pub async fn delete(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let before = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::TransactionNotFound)?;

    let moves = net(reverse(&effect_of(&before)?));
    apply_moves(&mut tx, actor.workspace_id, &moves).await?;

    repo::soft_delete(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "transaction.deleted",
        ENTITY,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

// -------------------------------------------------------------------- bulk

/// What became of one row. Three different things, counted and reported
/// separately, because a user reading "40 imported" wants to know what
/// happened to the other six (TXN-16).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RowOutcome {
    Created,
    Duplicate,
    Skipped,
}

impl RowOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "imported",
            Self::Duplicate => "duplicate",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Default)]
pub struct BulkOutcome {
    pub created: usize,
    pub duplicates: usize,
    /// One entry per row that could not be written, with its index in the
    /// request and why. Row-level errors are reported, never fatal.
    pub skipped: Vec<SkippedRow>,
    /// One entry per input row, in input order. The counts above are what
    /// a caller usually wants; this is what a review screen needs, because
    /// "which of my rows was the duplicate" is not answerable from a
    /// number.
    pub outcomes: Vec<RowOutcome>,
}

#[derive(Debug, Clone)]
pub struct SkippedRow {
    pub index: usize,
    pub code: &'static str,
    pub reason: String,
}

/// Commit many rows, skipping what cannot be written (TXN-11, TXN-16).
///
/// Validation is a filter, not a gate: valid rows are committed and invalid
/// rows come back with their reason, so one bad line never costs a file.
/// Each row converts at the rate for its own date, from the cache only,
/// because a statement can span months and a live call per row would be
/// thousands of calls (TXN-23, D45).
pub async fn bulk_create(
    pool: &PgPool,
    actor: Actor<'_>,
    inputs: Vec<TransactionInput<'_>>,
    row_limit: usize,
) -> Result<BulkOutcome> {
    if inputs.len() > row_limit {
        return Err(AppError::validation([(
            "transactions",
            "An import is capped at 5,000 rows. Split the file.",
        )]));
    }

    let workspace = accounts::find_workspace(pool, actor.workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let mut outcome = BulkOutcome::default();
    let mut tx = pool.begin().await.map_err(internal)?;

    for (index, input) in inputs.iter().enumerate() {
        match prepare_import_row(&mut tx, actor.workspace_id, &workspace.currency_code, input).await
        {
            Ok(prepared) => {
                let print = fingerprint_for(input, &prepared);

                // The unique index is the real guard; this read makes a
                // duplicate a counted outcome instead of a failed statement
                // that would take the whole batch with it.
                let seen = repo::existing_fingerprints(
                    &mut *tx,
                    actor.workspace_id,
                    std::slice::from_ref(&print),
                )
                .await
                .map_err(internal)?;

                if !seen.is_empty() {
                    outcome.duplicates += 1;
                    outcome.outcomes.push(RowOutcome::Duplicate);
                    continue;
                }

                let moves = net(prepared.shape.effect());
                apply_moves(&mut tx, actor.workspace_id, &moves).await?;

                let row = repo::insert(
                    &mut *tx,
                    new_row(&cuid2::create_id(), actor, input, &prepared, Some(&print)),
                )
                .await
                .map_err(internal)?;

                log(
                    &mut tx,
                    actor,
                    "transaction.created",
                    ENTITY,
                    &row.id,
                    None,
                    snapshot(&row)?,
                )
                .await?;

                outcome.created += 1;
                outcome.outcomes.push(RowOutcome::Created);
            }
            Err(error) => {
                outcome.skipped.push(SkippedRow {
                    index,
                    code: error.code(),
                    reason: error.to_string(),
                });
                outcome.outcomes.push(RowOutcome::Skipped);
            }
        }
    }

    tx.commit().await.map_err(internal)?;
    Ok(outcome)
}

/// Transform spreadsheet rows and commit them (TXN-11, D28).
///
/// The rows arrive as they came out of the file, with a mapping of which
/// column holds what. Everything numeric happens here, in code: the model
/// mapped column names once and never saw a row, so it cannot have moved a
/// decimal point.
///
/// A row that cannot be read is reported with its index and skipped, like
/// any other row-level failure.
pub async fn import_rows(
    pool: &PgPool,
    actor: Actor<'_>,
    wallet_id: &str,
    mapping: &ColumnMapping,
    rows: &[RawRow],
    categories: &std::collections::BTreeMap<String, String>,
    row_limit: usize,
) -> Result<BulkOutcome> {
    if rows.len() > row_limit {
        return Err(AppError::validation([(
            "rows",
            "An import is capped at 5,000 rows. Split the file.",
        )]));
    }

    let mut inputs = Vec::with_capacity(rows.len());
    let mut unreadable = Vec::new();

    for (index, raw) in rows.iter().enumerate() {
        match transform(mapping, raw) {
            Ok(row) => inputs.push((index, row)),
            Err(error) => unreadable.push(SkippedRow {
                index,
                code: "VALIDATION_FAILED",
                reason: error.to_string(),
            }),
        }
    }

    // Owned, because `TransactionInput` borrows its strings and the
    // transformed rows have to outlive the call.
    let prepared: Vec<_> = inputs
        .iter()
        .map(|(index, row)| {
            let category_id = row
                .category
                .as_ref()
                .and_then(|name| categories.get(&name.to_lowercase()))
                .cloned();
            (*index, row, category_id)
        })
        .collect();

    let payload: Vec<TransactionInput<'_>> = prepared
        .iter()
        .map(|(_, row, category_id)| TransactionInput {
            kind: row.kind,
            wallet_id,
            to_wallet_id: None,
            category_id: category_id.as_deref(),
            amount: row.amount,
            to_amount: None,
            original_amount: None,
            original_currency_code: None,
            exchange_rate: None,
            requested_base_rate: None,
            // Midday in UTC, so a row stays on the day the statement says
            // whatever zone it is read in.
            date: row
                .date
                .and_hms_opt(12, 0, 0)
                .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc))
                .unwrap_or_else(Utc::now),
            name: row.name.as_deref(),
            description: row.description.as_deref(),
            is_ready: false,
            // An imported row carries no files.
            attachment_ids: None,
        })
        .collect();

    let mut outcome = bulk_create(pool, actor, payload, row_limit).await?;

    // Report indexes from the original file, not from the filtered list, so
    // the review step can point at the line the user has to fix.
    for skipped in &mut outcome.skipped {
        if let Some((original, _, _)) = prepared.get(skipped.index) {
            skipped.index = *original;
        }
    }
    outcome.skipped.extend(unreadable);
    outcome.skipped.sort_by_key(|row| row.index);

    // `bulk_create` saw only the rows that could be read, so its outcomes
    // are indexed against that shorter list. Expand them back to the file:
    // a row that never reached it was skipped before it got there, and the
    // review screen counts the lines of the file the user uploaded.
    let mut full = vec![RowOutcome::Skipped; rows.len()];
    for (position, (original, _, _)) in prepared.iter().enumerate() {
        if let Some(result) = outcome.outcomes.get(position) {
            full[*original] = *result;
        }
    }
    outcome.outcomes = full;

    Ok(outcome)
}

/// Change the category, the ready flag, or both, across a selection.
///
/// Neither column touches a balance, which is why this is one statement and
/// a bulk delete is not.
pub async fn bulk_update(
    pool: &PgPool,
    actor: Actor<'_>,
    ids: &[String],
    category_id: Option<Option<&str>>,
    is_ready: Option<bool>,
) -> Result<usize> {
    check_bulk_size(ids)?;

    if category_id.is_none() && is_ready.is_none() {
        return Err(AppError::validation([(
            "changes",
            "Choose a category or a ready state to apply.",
        )]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;

    if let Some(Some(category_id)) = category_id {
        require_category(&mut tx, actor.workspace_id, category_id).await?;
    }

    let before = repo::find_many(&mut *tx, actor.workspace_id, ids)
        .await
        .map_err(internal)?;

    repo::bulk_update(&mut *tx, actor.workspace_id, ids, category_id, is_ready)
        .await
        .map_err(internal)?;

    let after = repo::find_many(&mut *tx, actor.workspace_id, ids)
        .await
        .map_err(internal)?;

    // One audit row per transaction, not one for the batch: the history
    // section of a row has to show what happened to that row (OPS-8).
    for (old, new) in before.iter().zip(after.iter()) {
        log(
            &mut tx,
            actor,
            "transaction.updated",
            ENTITY,
            &old.id,
            snapshot(old)?,
            snapshot(new)?,
        )
        .await?;
    }

    tx.commit().await.map_err(internal)?;
    Ok(before.len())
}

/// Soft-delete a selection, reversing every affected balance (TXN-14).
pub async fn bulk_delete(pool: &PgPool, actor: Actor<'_>, ids: &[String]) -> Result<usize> {
    check_bulk_size(ids)?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let rows = repo::find_many(&mut *tx, actor.workspace_id, ids)
        .await
        .map_err(internal)?;

    // Every row's reversal netted into one move per wallet, so a selection
    // of 500 rows against three wallets takes three locks, not a thousand.
    let mut all = Vec::new();
    for row in &rows {
        all.extend(reverse(&effect_of(row)?));
    }
    let moves = net(all);
    apply_moves(&mut tx, actor.workspace_id, &moves).await?;

    repo::soft_delete_many(&mut *tx, actor.workspace_id, ids)
        .await
        .map_err(internal)?;

    for row in &rows {
        log(
            &mut tx,
            actor,
            "transaction.deleted",
            ENTITY,
            &row.id,
            snapshot(row)?,
            None,
        )
        .await?;
    }

    tx.commit().await.map_err(internal)?;
    Ok(rows.len())
}

fn check_bulk_size(ids: &[String]) -> Result<()> {
    if ids.is_empty() {
        return Err(AppError::validation([(
            "ids",
            "Select at least one transaction.",
        )]));
    }
    if ids.len() > BULK_LIMIT {
        return Err(AppError::validation([(
            "ids",
            "A bulk action is capped at 500 transactions.",
        )]));
    }
    Ok(())
}

// ------------------------------------------------------------------ export

/// Every matching row as CSV, and the rows it covered marked (TXN-10).
///
/// Amounts are written as unformatted decimals, so a spreadsheet can add
/// them up rather than reading them as text.
pub async fn export(
    pool: &PgPool,
    actor: Actor<'_>,
    filters: &TransactionFilters<'_>,
    sort: SortField,
    order: SortOrder,
) -> Result<String> {
    let workspace = accounts::find_workspace(pool, actor.workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let rows = repo::list_all(pool, actor.workspace_id, filters, sort, order)
        .await
        .map_err(internal)?;

    // The first seven columns and their order are the old export's, so a
    // saved spreadsheet template still opens. The rest are new, because the
    // old app had no multicurrency and a USD row exported as a bare number
    // would be unreadable.
    let mut csv = String::from(
        "Date,Type,Amount,Category,Wallet,To Wallet,Description,\
         Currency,Original Amount,Original Currency,Exchange Rate,Base Amount,Base Currency\n",
    );

    for row in &rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            row.date.date_naive(),
            row.r#type,
            row.amount,
            quote(row.category_name.as_deref().unwrap_or("")),
            quote(&row.wallet_name),
            quote(row.to_wallet_name.as_deref().unwrap_or("")),
            quote(
                row.description
                    .as_deref()
                    .or(row.name.as_deref())
                    .unwrap_or("")
            ),
            row.wallet_currency_code,
            row.original_amount
                .map(|a| a.to_string())
                .unwrap_or_default(),
            row.original_currency_code.clone().unwrap_or_default(),
            row.exchange_rate.map(|r| r.to_string()).unwrap_or_default(),
            row.base_amount,
            workspace.currency_code,
        ));
    }

    let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
    if !ids.is_empty() {
        repo::mark_exported(pool, actor.workspace_id, &ids)
            .await
            .map_err(internal)?;
    }

    Ok(csv)
}

/// RFC 4180 quoting: wrap in quotes and double any quote inside.
///
/// Applied to every free-text column, so a description containing a comma
/// cannot shift every column after it.
fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

// ----------------------------------------------------------------- shared

/// Everything that can be worked out before the transaction opens,
/// including the rate lookup, so the transaction holds its locks only for
/// the writes.
async fn prepare(
    pool: &PgPool,
    workspace_id: &str,
    input: &TransactionInput<'_>,
) -> Result<Prepared> {
    let shape = TransactionShape::validate(ProposedShape {
        kind: input.kind,
        wallet_id: input.wallet_id,
        to_wallet_id: input.to_wallet_id,
        amount: input.amount,
        to_amount: input.to_amount,
    })?;

    let workspace = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let source = wallets::find_wallet(pool, workspace_id, &shape.wallet_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    if let Some(destination) = &shape.to_wallet_id {
        wallets::find_wallet(pool, workspace_id, destination)
            .await
            .map_err(internal)?
            .ok_or(AppError::WalletNotFound)?;
    }

    if let Some(category_id) = input.category_id {
        categories::find_category(pool, workspace_id, category_id)
            .await
            .map_err(internal)?
            .ok_or(AppError::CategoryNotFound)?;
    }

    let foreign = foreign_entry(input)?;
    oewang_domain::ledger::validate_foreign_entry(
        foreign.as_ref(),
        &source.currency_code,
        shape.amount,
    )?;

    let date = input.date.date_naive();
    let resolved = fx::service::resolve(
        pool,
        &source.currency_code,
        &workspace.currency_code,
        date,
        input.requested_base_rate,
    )
    .await?;

    Ok(Prepared {
        base_amount: round_money(shape.amount * resolved.rate),
        base_rate: resolved.rate,
        base_rate_source: resolved.source.as_str(),
        base_rate_date: resolved.date,
        wallet_currency: source.currency_code,
        shape,
        foreign,
    })
}

/// The same work for one imported row, without a live rate lookup.
///
/// A statement can cover months, so each row converts at the rate for its
/// own date, read from the cache. A row with no cached rate for its date is
/// skipped and reported separately, because the fix is a rate backfill
/// rather than a corrected file (TXN-23).
async fn prepare_import_row(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    workspace_currency: &str,
    input: &TransactionInput<'_>,
) -> Result<Prepared> {
    let shape = TransactionShape::validate(ProposedShape {
        kind: input.kind,
        wallet_id: input.wallet_id,
        to_wallet_id: input.to_wallet_id,
        amount: input.amount,
        to_amount: input.to_amount,
    })?;

    let source = wallets::find_wallet(&mut **tx, workspace_id, &shape.wallet_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    if let Some(destination) = &shape.to_wallet_id {
        wallets::find_wallet(&mut **tx, workspace_id, destination)
            .await
            .map_err(internal)?
            .ok_or(AppError::WalletNotFound)?;
    }

    if let Some(category_id) = input.category_id {
        require_category(tx, workspace_id, category_id).await?;
    }

    let foreign = foreign_entry(input)?;
    oewang_domain::ledger::validate_foreign_entry(
        foreign.as_ref(),
        &source.currency_code,
        shape.amount,
    )?;

    let date = input.date.date_naive();
    let resolved = fx::service::resolve_cached(
        &mut **tx,
        &source.currency_code,
        workspace_currency,
        date,
        input.requested_base_rate,
    )
    .await?;

    Ok(Prepared {
        base_amount: round_money(shape.amount * resolved.rate),
        base_rate: resolved.rate,
        base_rate_source: resolved.source.as_str(),
        base_rate_date: resolved.date,
        wallet_currency: source.currency_code,
        shape,
        foreign,
    })
}

fn foreign_entry(input: &TransactionInput<'_>) -> Result<Option<ForeignEntry>> {
    match (
        input.original_amount,
        input.original_currency_code,
        input.exchange_rate,
    ) {
        (None, None, None) => Ok(None),
        (Some(amount), Some(code), Some(rate)) => Ok(Some(ForeignEntry {
            original_amount: amount,
            original_currency_code: oewang_domain::normalize_currency_code(code),
            exchange_rate: rate,
        })),
        // The three columns travel together or not at all. A partial set is
        // a client bug, and silently dropping it would lose what the user
        // typed.
        _ => Err(AppError::validation([(
            "original_currency_code",
            "Send the original amount, its currency and the rate together, or none of them.",
        )])),
    }
}

fn new_row<'a>(
    id: &'a str,
    actor: Actor<'a>,
    input: &'a TransactionInput<'a>,
    prepared: &'a Prepared,
    fingerprint: Option<&'a str>,
) -> repo::NewTransaction<'a> {
    repo::NewTransaction {
        id,
        workspace_id: actor.workspace_id,
        wallet_id: &prepared.shape.wallet_id,
        to_wallet_id: prepared.shape.to_wallet_id.as_deref(),
        category_id: input.category_id,
        amount: prepared.shape.amount,
        to_amount: prepared.shape.to_amount,
        original_amount: prepared.foreign.as_ref().map(|f| f.original_amount),
        original_currency_code: prepared
            .foreign
            .as_ref()
            .map(|f| f.original_currency_code.as_str()),
        exchange_rate: prepared.foreign.as_ref().map(|f| f.exchange_rate),
        base_amount: prepared.base_amount,
        base_rate: prepared.base_rate,
        base_rate_source: prepared.base_rate_source,
        base_rate_date: prepared.base_rate_date,
        date: input.date,
        kind: prepared.shape.kind.as_str(),
        name: input.name,
        description: input.description,
        is_ready: input.is_ready,
        source: actor.source,
        fingerprint,
    }
}

/// The balance effect of a row already in the database.
fn effect_of(row: &TransactionRow) -> Result<Vec<BalanceDelta>> {
    let kind: TransactionType = row.r#type.parse().map_err(|error| {
        AppError::Internal(anyhow::anyhow!("unknown type in database: {error}"))
    })?;

    Ok(TransactionShape {
        kind,
        wallet_id: row.wallet_id.clone(),
        to_wallet_id: row.to_wallet_id.clone(),
        amount: row.amount,
        to_amount: row.to_amount,
    }
    .effect())
}

/// Lock every affected wallet, then move each balance (TXN-6, D13).
///
/// `net` has already sorted the moves by wallet ID, and the lock statement
/// sorts again, so two transfers in opposite directions take their locks in
/// the same order and cannot deadlock.
async fn apply_moves(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    moves: &[BalanceDelta],
) -> Result<()> {
    if moves.is_empty() {
        return Ok(());
    }

    let ids: Vec<String> = moves.iter().map(|m| m.wallet_id.clone()).collect();
    let locked = repo::lock_wallets(&mut **tx, workspace_id, &ids)
        .await
        .map_err(internal)?;

    // A wallet that vanished between validation and the lock, or one from
    // another workspace, is the same answer.
    if locked.len() != ids.len() {
        return Err(AppError::WalletNotFound);
    }

    for movement in moves {
        repo::apply_delta(&mut **tx, workspace_id, &movement.wallet_id, movement.delta)
            .await
            .map_err(internal)?;
    }

    Ok(())
}

async fn require_category(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    category_id: &str,
) -> Result<()> {
    categories::find_category(&mut **tx, workspace_id, category_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::CategoryNotFound)
        .map(|_| ())
}

/// The content hash that makes a re-import a no-op (TXN-16, D29).
///
/// The currency is the row's own: the entry currency when the user typed a
/// foreign one, the wallet's otherwise. The description stands in for the
/// counterparty the spec names, because this product has no separate
/// counterparty column and the description is where a bank export puts it.
fn fingerprint_for(input: &TransactionInput<'_>, prepared: &Prepared) -> String {
    let currency = prepared
        .foreign
        .as_ref()
        .map(|f| f.original_currency_code.as_str())
        .unwrap_or(&prepared.wallet_currency);

    fingerprint(
        &prepared.shape.wallet_id,
        &input.date.date_naive().to_string(),
        prepared.shape.amount,
        currency,
        input.name.unwrap_or(""),
        input.description.unwrap_or(""),
    )
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

// -------------------------------------------------------------- line items

pub use oewang_db::repositories::vault::{AttachmentRow, ItemRow};

const ITEM_ENTITY: &str = "transaction_item";

/// What one line item holds. Items do not move a balance; only the parent
/// transaction's `amount` does (TXN-12).
#[derive(Debug, Clone)]
pub struct ItemInput<'a> {
    pub name: &'a str,
    pub brand: Option<&'a str>,
    pub quantity: Option<Decimal>,
    pub unit: Option<&'a str>,
    pub unit_price: Option<Decimal>,
    pub amount: Decimal,
    pub category_id: Option<&'a str>,
    pub notes: Option<&'a str>,
}

pub async fn list_items(
    pool: &PgPool,
    workspace_id: &str,
    transaction_id: &str,
) -> Result<Vec<ItemRow>> {
    // Through the transaction, so an item request cannot probe for ids in
    // another workspace.
    find(pool, workspace_id, transaction_id).await?;

    vault::list_items(pool, workspace_id, transaction_id)
        .await
        .map_err(internal)
}

pub async fn list_attachments(
    pool: &PgPool,
    workspace_id: &str,
    transaction_id: &str,
) -> Result<Vec<AttachmentRow>> {
    vault::list_attachments(pool, workspace_id, transaction_id)
        .await
        .map_err(internal)
}

pub async fn add_item(
    pool: &PgPool,
    actor: Actor<'_>,
    transaction_id: &str,
    input: ItemInput<'_>,
) -> Result<ItemRow> {
    validate_item(&input)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    require_transaction(&mut tx, actor.workspace_id, transaction_id).await?;

    if let Some(category_id) = input.category_id {
        require_category(&mut tx, actor.workspace_id, category_id).await?;
    }

    let item = vault::insert_item(
        &mut *tx,
        new_item(
            &cuid2::create_id(),
            actor.workspace_id,
            transaction_id,
            &input,
        ),
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "transaction_item.created",
        ITEM_ENTITY,
        &item.id,
        None,
        snapshot(&item)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(item)
}

pub async fn replace_item(
    pool: &PgPool,
    actor: Actor<'_>,
    transaction_id: &str,
    item_id: &str,
    input: ItemInput<'_>,
) -> Result<ItemRow> {
    validate_item(&input)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    require_transaction(&mut tx, actor.workspace_id, transaction_id).await?;

    if let Some(category_id) = input.category_id {
        require_category(&mut tx, actor.workspace_id, category_id).await?;
    }

    let before = vault::list_items(&mut *tx, actor.workspace_id, transaction_id)
        .await
        .map_err(internal)?
        .into_iter()
        .find(|item| item.id == item_id)
        .ok_or(AppError::NotFound)?;

    let after = vault::replace_item(
        &mut *tx,
        actor.workspace_id,
        item_id,
        new_item(item_id, actor.workspace_id, transaction_id, &input),
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::NotFound)?;

    log(
        &mut tx,
        actor,
        "transaction_item.updated",
        ITEM_ENTITY,
        item_id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

pub async fn delete_item(
    pool: &PgPool,
    actor: Actor<'_>,
    transaction_id: &str,
    item_id: &str,
) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    require_transaction(&mut tx, actor.workspace_id, transaction_id).await?;

    let before = vault::list_items(&mut *tx, actor.workspace_id, transaction_id)
        .await
        .map_err(internal)?
        .into_iter()
        .find(|item| item.id == item_id)
        .ok_or(AppError::NotFound)?;

    vault::soft_delete_item(&mut *tx, actor.workspace_id, item_id)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "transaction_item.deleted",
        ITEM_ENTITY,
        item_id,
        snapshot(&before)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

fn validate_item(input: &ItemInput<'_>) -> Result<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::validation([("name", "Enter a name.")]));
    }
    // An item may be a refund line, so zero is refused and negative is
    // not. The item total is never forced to match the transaction; a
    // mismatch raises a badge in the UI and nothing more (TXN-12).
    if input.amount == Decimal::ZERO {
        return Err(AppError::AmountNotPositive);
    }
    if input
        .quantity
        .is_some_and(|quantity| quantity <= Decimal::ZERO)
    {
        return Err(AppError::validation([(
            "quantity",
            "Enter a quantity greater than zero.",
        )]));
    }

    Ok(())
}

fn new_item<'a>(
    id: &'a str,
    workspace_id: &'a str,
    transaction_id: &'a str,
    input: &'a ItemInput<'a>,
) -> vault::NewItem<'a> {
    vault::NewItem {
        id,
        workspace_id,
        transaction_id,
        name: input.name.trim(),
        brand: input.brand,
        quantity: input.quantity,
        unit: input.unit,
        unit_price: input.unit_price,
        amount: round_money(input.amount),
        category_id: input.category_id,
        notes: input.notes,
    }
}

async fn require_transaction(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    transaction_id: &str,
) -> Result<()> {
    repo::find(&mut **tx, workspace_id, transaction_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::TransactionNotFound)
        .map(|_| ())
}
