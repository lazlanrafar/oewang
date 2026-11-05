//! Wallet, wallet-group and category rules.
//!
//! Services own the rules, open the one database transaction, and write the
//! audit row inside it (D14, OPS-1). Handlers parse and map to HTTP;
//! repositories run SQL.

use chrono::Utc;
use oewang_clients::RatesClient;
use oewang_db::{
    repositories::{accounts, categories, wallets},
    PgPool,
};
use oewang_domain::{
    ledger::{round_money, TransactionType},
    validate_currency_code, AppError, Result,
};
use rust_decimal::Decimal;

use oewang_db::repositories::{
    categories::CategoryRow,
    wallets::{NewWallet, WalletGroupRow, WalletListRow, WalletPatch, WalletRow},
};

pub use crate::audit::Actor;
use crate::{
    audit::{log, snapshot},
    transactions::service::{self as ledger, TransactionInput},
};

const ENTITY_WALLET: &str = "wallet";
const ENTITY_WALLET_GROUP: &str = "wallet_group";
const ENTITY_CATEGORY: &str = "category";

// ----------------------------------------------------------- wallet groups

pub async fn list_groups(pool: &PgPool, workspace_id: &str) -> Result<Vec<WalletGroupRow>> {
    wallets::list_groups(pool, workspace_id)
        .await
        .map_err(internal)
}

pub async fn create_group(
    pool: &PgPool,
    actor: Actor<'_>,
    name: &str,
    sort_order: Option<i32>,
) -> Result<WalletGroupRow> {
    let name = clean_name("name", name)?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let group = wallets::insert_group(
        &mut *tx,
        &cuid2::create_id(),
        actor.workspace_id,
        &name,
        sort_order.unwrap_or(0),
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "wallet_group.created",
        ENTITY_WALLET_GROUP,
        &group.id,
        None,
        snapshot(&group)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(group)
}

pub async fn update_group(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    name: Option<&str>,
    sort_order: Option<i32>,
) -> Result<WalletGroupRow> {
    let name = name.map(|value| clean_name("name", value)).transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let before = wallets::find_group(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let after = wallets::update_group(
        &mut *tx,
        actor.workspace_id,
        id,
        name.as_deref(),
        sort_order,
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::NotFound)?;

    log(
        &mut tx,
        actor,
        "wallet_group.updated",
        ENTITY_WALLET_GROUP,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Soft delete, detaching the group's wallets rather than deleting them.
pub async fn delete_group(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let before = wallets::find_group(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    wallets::clear_group_on_wallets(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    wallets::soft_delete_group(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "wallet_group.deleted",
        ENTITY_WALLET_GROUP,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

// ----------------------------------------------------------------- wallets

pub async fn list_wallets(pool: &PgPool, workspace_id: &str) -> Result<Vec<WalletListRow>> {
    wallets::list_wallets(pool, workspace_id)
        .await
        .map_err(internal)
}

pub async fn find_wallet(pool: &PgPool, workspace_id: &str, id: &str) -> Result<WalletRow> {
    wallets::find_wallet(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)
}

#[derive(Debug)]
pub struct NewWalletInput<'a> {
    pub name: &'a str,
    pub group_id: Option<&'a str>,
    /// Absent means the workspace currency (WAL-5).
    pub currency_code: Option<&'a str>,
    pub is_included_in_totals: Option<bool>,
    pub sort_order: Option<i32>,
}

pub async fn create_wallet(
    pool: &PgPool,
    actor: Actor<'_>,
    input: NewWalletInput<'_>,
) -> Result<WalletRow> {
    let name = clean_name("name", input.name)?;
    let currency = input
        .currency_code
        .map(|code| validate_currency_code("currency_code", code))
        .transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;

    // A wallet that names no currency inherits the workspace's, which is why
    // the default is resolved here and not by a column default.
    let currency = match currency {
        Some(code) => code,
        None => {
            accounts::find_workspace(&mut *tx, actor.workspace_id)
                .await
                .map_err(internal)?
                .ok_or(AppError::NotFound)?
                .currency_code
        }
    };

    if let Some(group_id) = input.group_id {
        require_group(&mut tx, actor.workspace_id, group_id).await?;
    }

    let wallet = wallets::insert_wallet(
        &mut *tx,
        NewWallet {
            id: &cuid2::create_id(),
            workspace_id: actor.workspace_id,
            group_id: input.group_id,
            name: &name,
            currency_code: &currency,
            is_included_in_totals: input.is_included_in_totals.unwrap_or(true),
            sort_order: input.sort_order.unwrap_or(0),
        },
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "wallet.created",
        ENTITY_WALLET,
        &wallet.id,
        None,
        snapshot(&wallet)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(wallet)
}

#[derive(Debug, Default)]
pub struct WalletPatchInput<'a> {
    pub name: Option<&'a str>,
    /// `Some(None)` detaches the wallet from its group; `None` leaves it.
    pub group_id: Option<Option<&'a str>>,
    pub currency_code: Option<&'a str>,
    pub is_included_in_totals: Option<bool>,
    pub sort_order: Option<i32>,
}

pub async fn update_wallet(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    input: WalletPatchInput<'_>,
) -> Result<WalletRow> {
    let name = input
        .name
        .map(|value| clean_name("name", value))
        .transpose()?;
    let currency = input
        .currency_code
        .map(|code| validate_currency_code("currency_code", code))
        .transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;

    // Locked, because the currency check below and a concurrent transaction
    // write must not disagree about whether this wallet has transactions.
    let before = wallets::lock_wallet(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    // Re-sending the currency the wallet already has is not a change, and a
    // locked wallet should not reject a patch that only renames it.
    let currency = currency.filter(|code| code != &before.currency_code);

    if currency.is_some()
        && wallets::wallet_has_live_transactions(&mut *tx, actor.workspace_id, id)
            .await
            .map_err(internal)?
    {
        return Err(AppError::WalletCurrencyLocked);
    }

    if let Some(Some(group_id)) = input.group_id {
        require_group(&mut tx, actor.workspace_id, group_id).await?;
    }

    let after = wallets::update_wallet(
        &mut *tx,
        actor.workspace_id,
        id,
        WalletPatch {
            name: name.as_deref(),
            group_id: input.group_id,
            currency_code: currency.as_deref(),
            is_included_in_totals: input.is_included_in_totals,
            sort_order: input.sort_order,
        },
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::WalletNotFound)?;

    log(
        &mut tx,
        actor,
        "wallet.updated",
        ENTITY_WALLET,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Make a wallet the default, clearing the previous one (WAL-3).
pub async fn set_default_wallet(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<WalletRow> {
    let mut tx = pool.begin().await.map_err(internal)?;

    // Every live wallet, in ascending ID order, so two concurrent calls
    // serialize instead of both writing a default (D13).
    wallets::lock_wallets(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?;

    let before = wallets::find_wallet(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    wallets::clear_default_wallet(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?;
    wallets::mark_wallet_default(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    let after = wallets::find_wallet(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    log(
        &mut tx,
        actor,
        "wallet.set_default",
        ENTITY_WALLET,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Soft delete, refused while any live transaction references the wallet
/// (WAL-4).
pub async fn delete_wallet(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    // The same lock the set-default path takes, in the same order, so a
    // delete and a set-default cannot interleave into two defaults or none.
    wallets::lock_wallets(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?;

    let before = wallets::find_wallet(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    if wallets::wallet_has_live_transactions(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::WalletHasTransactions);
    }

    wallets::soft_delete_wallet(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    // WAL-3 says exactly one wallet is the default. Deleting the default
    // would leave none, so the next wallet in display order inherits it.
    if before.is_default {
        if let Some(next) = wallets::next_default_candidate(&mut *tx, actor.workspace_id)
            .await
            .map_err(internal)?
        {
            wallets::mark_wallet_default(&mut *tx, actor.workspace_id, &next)
                .await
                .map_err(internal)?;
        }
    }

    log(
        &mut tx,
        actor,
        "wallet.deleted",
        ENTITY_WALLET,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

/// What a balance adjustment is called in the ledger (TXN-3).
const ADJUSTMENT_NAME: &str = "Balance adjustment";

/// Bring a wallet to `target` by writing the one transaction that gets it
/// there.
///
/// `wallets.balance` is not written, here or anywhere: the balance is the
/// ledger's consequence, so a correction that wrote the column would make
/// the two disagree and leave nothing saying why (TXN-3,
/// docs/api/endpoints.md#wallets). The difference becomes an income or an
/// expense in the wallet's own currency and goes through the ordinary
/// create path, which is what locks the wallet, moves the balance and
/// writes the audit row inside one database transaction (D13, D14, OPS-1).
///
/// Asking for the balance the wallet already has writes nothing and
/// succeeds. It is not a mistake, and the ledger refuses a zero amount
/// anyway.
///
/// The read and the write are not one atomic act. A transaction committed
/// by someone else in between moves the balance after the difference was
/// computed, and the wallet then lands beside the target rather than on
/// it. Closing that would mean computing the difference under the wallet's
/// own lock, which means reimplementing the create path; a manual
/// correction racing another write is not worth a second copy of the
/// ledger.
pub async fn adjust_wallet_balance(
    pool: &PgPool,
    rates: &RatesClient,
    actor: Actor<'_>,
    id: &str,
    target: Decimal,
) -> Result<WalletRow> {
    let wallet = find_wallet(pool, actor.workspace_id, id).await?;
    let difference = round_money(target) - wallet.balance;

    if difference.is_zero() {
        return Ok(wallet);
    }

    let kind = if difference > Decimal::ZERO {
        TransactionType::Income
    } else {
        TransactionType::Expense
    };

    ledger::create(
        pool,
        rates,
        actor,
        TransactionInput {
            kind,
            wallet_id: id,
            to_wallet_id: None,
            // A correction belongs to no category: inventing one would put
            // it in a report the user never spent that money in.
            category_id: None,
            // The wallet's own currency. `create` converts it to the
            // workspace currency itself and writes that as `base_amount`,
            // which is why the balance lands on the target either way.
            amount: difference.abs(),
            to_amount: None,
            original_amount: None,
            original_currency_code: None,
            exchange_rate: None,
            requested_base_rate: None,
            date: Utc::now(),
            name: Some(ADJUSTMENT_NAME),
            description: None,
            // Nothing left to review: the user named the figure.
            is_ready: true,
            attachment_ids: None,
        },
    )
    .await?;

    find_wallet(pool, actor.workspace_id, id).await
}

// -------------------------------------------------------------- categories

pub const CATEGORY_TYPES: [&str; 2] = ["income", "expense"];

fn validate_type(kind: &str) -> Result<String> {
    let normalized = kind.trim().to_lowercase();
    if CATEGORY_TYPES.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(AppError::validation([(
            "type",
            "Use either income or expense.",
        )]))
    }
}

pub async fn list_categories(
    pool: &PgPool,
    workspace_id: &str,
    kind: Option<&str>,
) -> Result<Vec<CategoryRow>> {
    let kind = kind.map(validate_type).transpose()?;
    categories::list_categories(pool, workspace_id, kind.as_deref())
        .await
        .map_err(internal)
}

pub async fn create_category(
    pool: &PgPool,
    actor: Actor<'_>,
    name: &str,
    kind: &str,
    sort_order: Option<i32>,
) -> Result<CategoryRow> {
    let name = clean_name("name", name)?;
    let kind = validate_type(kind)?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let category = categories::insert_category(
        &mut *tx,
        &cuid2::create_id(),
        actor.workspace_id,
        &name,
        &kind,
        sort_order.unwrap_or(0),
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "category.created",
        ENTITY_CATEGORY,
        &category.id,
        None,
        snapshot(&category)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(category)
}

pub async fn update_category(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    name: Option<&str>,
    kind: Option<&str>,
    sort_order: Option<i32>,
) -> Result<CategoryRow> {
    let name = name.map(|value| clean_name("name", value)).transpose()?;
    let kind = kind.map(validate_type).transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let before = categories::find_category(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::CategoryNotFound)?;

    let after = categories::update_category(
        &mut *tx,
        actor.workspace_id,
        id,
        name.as_deref(),
        kind.as_deref(),
        sort_order,
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::CategoryNotFound)?;

    log(
        &mut tx,
        actor,
        "category.updated",
        ENTITY_CATEGORY,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Soft delete. Transactions keep their money and lose their label (CAT-2).
pub async fn delete_category(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let before = categories::find_category(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::CategoryNotFound)?;

    categories::clear_category_on_transactions(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    categories::clear_category_on_items(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    categories::soft_delete_category(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "category.deleted",
        ENTITY_CATEGORY,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

// ------------------------------------------------------- workspace currency

/// Move the workspace currency, refused once any transaction exists (WAL-6).
///
/// Lives here rather than in the workspace handler because the lock it
/// enforces is a ledger rule, and the ledger is what makes it true.
pub async fn update_workspace_currency(
    pool: &PgPool,
    actor: Actor<'_>,
    currency_code: &str,
) -> Result<String> {
    let currency = validate_currency_code("currency_code", currency_code)?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let before = accounts::find_workspace(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    if before.currency_code == currency {
        tx.commit().await.map_err(internal)?;
        return Ok(currency);
    }

    if wallets::workspace_has_transactions(&mut *tx, actor.workspace_id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::WorkspaceCurrencyLocked);
    }

    accounts::update_workspace_currency(&mut *tx, actor.workspace_id, &currency)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "workspace.currency_changed",
        "workspace",
        actor.workspace_id,
        Some(serde_json::json!({ "currency_code": before.currency_code })),
        Some(serde_json::json!({ "currency_code": currency })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(currency)
}

// ------------------------------------------------------------------ shared

async fn require_group(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    workspace_id: &str,
    group_id: &str,
) -> Result<()> {
    let found = wallets::find_group(&mut **tx, workspace_id, group_id)
        .await
        .map_err(internal)?;

    if found.is_some() {
        Ok(())
    } else {
        // A group id from another workspace is indistinguishable from one
        // that never existed, which is the point.
        Err(AppError::validation([(
            "group_id",
            "That wallet group does not exist.",
        )]))
    }
}

/// Trim, and refuse what is left if it is empty or implausibly long.
fn clean_name(field: &'static str, value: &str) -> Result<String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return Err(AppError::validation([(field, "Enter a name.")]));
    }
    if trimmed.chars().count() > 80 {
        return Err(AppError::validation([(
            field,
            "Use 80 characters or fewer.",
        )]));
    }

    Ok(trimmed.to_string())
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
