//! Tidy, then reuse: how a name the assistant or the receipt reader wrote
//! is stored, and the one-off tidy of names already stored (D129).
//!
//! A name arriving from `chat`, `receipt` or `telegram` is tidied by
//! `oewang_domain::names::tidy_name`, then replaced by the workspace's own
//! most recent spelling of the same key when there is one (ITM-1's key,
//! exact match only). A name a person typed in a form arrives as `web` and
//! is stored as typed.

use std::collections::HashMap;

use oewang_db::{
    repositories::{
        names::{self as repo, NameRow},
        transactions, vault,
    },
    PgPool,
};
use oewang_domain::{names::tidy_name, AppError, Result};
use serde::Serialize;
use sqlx::PgExecutor;

pub use oewang_db::repositories::names::NameKind;

use crate::{
    audit::{log, snapshot, Actor, SOURCE_CHAT, SOURCE_RECEIPT, SOURCE_TELEGRAM},
    transactions::service::{ENTITY, IMPORT_LIMIT, ITEM_ENTITY},
};

/// The surfaces whose names are written by the assistant or the receipt
/// reader rather than typed by a person.
fn tidies(source: &str) -> bool {
    matches!(source, SOURCE_CHAT | SOURCE_RECEIPT | SOURCE_TELEGRAM)
}

/// The spelling to store for `written`. `except_id` is the row being
/// edited, so a rename is never answered with that row's old spelling.
pub(crate) async fn stored(
    executor: impl PgExecutor<'_>,
    actor: Actor<'_>,
    kind: NameKind,
    written: &str,
    except_id: Option<&str>,
) -> Result<String> {
    if !tidies(actor.source) {
        return Ok(written.to_string());
    }
    let tidy = tidy_name(written);
    if tidy.is_empty() {
        return Ok(tidy);
    }
    let existing = repo::latest_spelling(executor, actor.workspace_id, kind, &tidy, except_id)
        .await
        .map_err(internal)?;
    Ok(existing.unwrap_or(tidy))
}

// ------------------------------------------------------------ the one-off tidy

/// One proposed rename.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TidyChange {
    pub kind: &'static str,
    pub id: String,
    pub transaction_id: String,
    pub from: String,
    pub to: String,
}

/// One rename the client asks for: which row, and the name it saw.
#[derive(Debug, Clone)]
pub struct TidyRequest {
    pub kind: NameKind,
    pub id: String,
    pub from: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct TidyOutcome {
    pub applied: usize,
    pub skipped: usize,
}

/// Every live transaction and item whose name would change.
pub async fn preview(pool: &PgPool, workspace_id: &str) -> Result<Vec<TidyChange>> {
    let mut changes = Vec::new();
    for kind in [NameKind::Transaction, NameKind::Item] {
        let rows = repo::list_live(pool, workspace_id, kind)
            .await
            .map_err(internal)?;
        changes.extend(proposals(kind, &rows));
    }
    Ok(changes)
}

/// What each row becomes. `rows` are newest first.
///
/// All spellings of one key become one: the newest spelling that is already
/// tidy, else the tidy form of the newest. Reusing an untidy spelling here,
/// as a live write does, would leave "MIXUE" as it is whenever it is the
/// only spelling, which is the case this exists for.
fn proposals(kind: NameKind, rows: &[NameRow]) -> Vec<TidyChange> {
    let tidied: Vec<String> = rows.iter().map(|row| tidy_name(&row.name)).collect();

    let mut target: HashMap<String, String> = HashMap::new();
    for (row, tidy) in rows.iter().zip(&tidied) {
        if !tidy.is_empty() && *tidy == row.name {
            target
                .entry(tidy.to_lowercase())
                .or_insert_with(|| tidy.clone());
        }
    }
    for tidy in tidied.iter().filter(|tidy| !tidy.is_empty()) {
        target
            .entry(tidy.to_lowercase())
            .or_insert_with(|| tidy.clone());
    }

    rows.iter()
        .zip(&tidied)
        .filter(|(_, tidy)| !tidy.is_empty())
        .filter_map(|(row, tidy)| {
            let to = &target[&tidy.to_lowercase()];
            (*to != row.name).then(|| TidyChange {
                kind: kind.as_str(),
                id: row.id.clone(),
                transaction_id: row.transaction_id.clone(),
                from: row.name.clone(),
                to: to.clone(),
            })
        })
        .collect()
}

/// Apply the requested renames, each with its audit row, in one database
/// transaction (D14). The new name is worked out again here, never taken
/// from the client. A row whose name is no longer the `from` the client saw,
/// or that no longer needs a change, is skipped.
pub async fn apply(
    pool: &PgPool,
    actor: Actor<'_>,
    requested: &[TidyRequest],
) -> Result<TidyOutcome> {
    if requested.len() > IMPORT_LIMIT {
        return Err(AppError::validation([(
            "changes",
            "Apply at most 5000 changes at a time.",
        )]));
    }

    let current: HashMap<(&'static str, String), TidyChange> = preview(pool, actor.workspace_id)
        .await?
        .into_iter()
        .map(|change| ((change.kind, change.id.clone()), change))
        .collect();

    let mut tx = pool.begin().await.map_err(internal)?;
    let mut applied = 0;
    for request in requested {
        let Some(change) = current
            .get(&(request.kind.as_str(), request.id.clone()))
            .filter(|change| change.from == request.from)
        else {
            continue;
        };
        let renamed = match request.kind {
            NameKind::Transaction => rename_transaction(&mut tx, actor, change).await?,
            NameKind::Item => rename_item(&mut tx, actor, change).await?,
        };
        applied += usize::from(renamed);
    }
    tx.commit().await.map_err(internal)?;

    Ok(TidyOutcome {
        applied,
        skipped: requested.len() - applied,
    })
}

async fn rename_transaction(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: Actor<'_>,
    change: &TidyChange,
) -> Result<bool> {
    let ws = actor.workspace_id;
    let Some(before) = transactions::find_for_update(&mut **tx, ws, &change.id)
        .await
        .map_err(internal)?
    else {
        return Ok(false);
    };
    let kind = NameKind::Transaction;
    if !repo::rename(&mut **tx, ws, kind, &change.id, &change.from, &change.to)
        .await
        .map_err(internal)?
    {
        return Ok(false);
    }
    let after = transactions::find(&mut **tx, ws, &change.id)
        .await
        .map_err(internal)?;
    let (before, after) = (snapshot(&before)?, snapshot(&after)?);
    log(
        tx,
        actor,
        "transaction.updated",
        ENTITY,
        &change.id,
        before,
        after,
    )
    .await?;
    Ok(true)
}

async fn rename_item(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: Actor<'_>,
    change: &TidyChange,
) -> Result<bool> {
    let ws = actor.workspace_id;
    let item = |items: Vec<vault::ItemRow>| items.into_iter().find(|item| item.id == change.id);
    let before = vault::list_items(&mut **tx, ws, &change.transaction_id)
        .await
        .map_err(internal)?;
    let Some(before) = item(before) else {
        return Ok(false);
    };
    let kind = NameKind::Item;
    if !repo::rename(&mut **tx, ws, kind, &change.id, &change.from, &change.to)
        .await
        .map_err(internal)?
    {
        return Ok(false);
    }
    let after = vault::list_items(&mut **tx, ws, &change.transaction_id)
        .await
        .map_err(internal)?;
    let (before, after) = (snapshot(&before)?, snapshot(&item(after))?);
    let action = "transaction_item.updated";
    log(tx, actor, action, ITEM_ENTITY, &change.id, before, after).await?;
    Ok(true)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;

    fn row(id: &str, name: &str) -> NameRow {
        NameRow {
            id: id.into(),
            transaction_id: id.into(),
            name: name.into(),
            updated_at: Utc.with_ymd_and_hms(2026, 11, 1, 0, 0, 0).unwrap(),
        }
    }

    fn renames(rows: &[NameRow]) -> Vec<(String, String)> {
        proposals(NameKind::Transaction, rows)
            .into_iter()
            .map(|change| (change.id, change.to))
            .collect()
    }

    #[test]
    fn should_tidy_a_lone_untidy_spelling() {
        assert_eq!(
            renames(&[row("a", "MIXUE")]),
            [("a".into(), "Mixue".into())]
        );
    }

    #[test]
    fn should_leave_tidy_names_out() {
        assert!(renames(&[row("a", "Mixue"), row("b", "ACK Pering DriveThru")]).is_empty());
    }

    #[test]
    fn should_bring_every_spelling_to_the_newest_tidy_one() {
        // Newest first: the person's own "ACK Pering DriveThru" wins over
        // the tidy form of the lowercase copies.
        let rows = [
            row("a", "ack pering drivethru"),
            row("b", "ACK Pering DriveThru"),
            row("c", "ACK  PERING  DRIVETHRU"),
        ];
        assert_eq!(
            renames(&rows),
            [
                ("a".into(), "ACK Pering DriveThru".into()),
                ("c".into(), "ACK Pering DriveThru".into()),
            ]
        );
    }
}
