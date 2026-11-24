//! Contacts, the other side of a debt (CON-1, CON-3, CON-4, D120).

use chrono::{DateTime, Utc};
use oewang_db::{
    repositories::{
        contacts::{
            self as repo, ContactListRow, ContactPatch, ContactRow, ContactSort, NewContact,
        },
        debts,
    },
    PgPool,
};
use oewang_domain::{AppError, Page, Result};
use sqlx::{Postgres, Transaction};

use crate::{
    audit::{log, snapshot, Actor},
    offline,
};

const ENTITY: &str = "contact";

pub struct ContactInput<'a> {
    pub name: &'a str,
    pub email: Option<&'a str>,
    pub phone: Option<&'a str>,
    pub note: Option<&'a str>,
}

/// `None` leaves a field alone; `Some(None)` clears it.
pub struct ContactChange<'a> {
    pub name: Option<&'a str>,
    pub email: Option<Option<&'a str>>,
    pub phone: Option<Option<&'a str>>,
    pub note: Option<Option<&'a str>>,
}

pub async fn list(
    pool: &PgPool,
    workspace_id: &str,
    search: Option<&str>,
    sort: ContactSort,
    descending: bool,
    page: Page,
) -> Result<(Vec<ContactListRow>, i64)> {
    let (rows, total) = tokio::try_join!(
        repo::list(
            pool,
            workspace_id,
            search,
            sort,
            descending,
            i64::from(page.limit),
            page.offset()
        ),
        repo::count(pool, workspace_id, search),
    )
    .map_err(internal)?;
    Ok((rows, total))
}

pub async fn find(pool: &PgPool, workspace_id: &str, id: &str) -> Result<ContactListRow> {
    repo::find_detail(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ContactNotFound)
}

/// The create `POST /v1/contacts` runs, and whether this call made the row
/// (D114).
pub async fn create_with_id(
    pool: &PgPool,
    actor: Actor<'_>,
    id: Option<&str>,
    input: ContactInput<'_>,
) -> Result<(ContactRow, bool)> {
    if let Some(id) = id {
        offline::validate_id(id)?;
        if offline::is_repeat(pool, actor.workspace_id, offline::CONTACT, id).await? {
            return repeated(pool, actor.workspace_id, id).await;
        }
    }

    let name = clean_name(input.name)?;
    let email = clean("email", input.email, 254)?;
    let phone = clean("phone", input.phone, 40)?;
    let note = clean("note", input.note, 2000)?;

    let id = id.map_or_else(cuid2::create_id, str::to_string);
    let mut tx = pool.begin().await.map_err(internal)?;
    let new = NewContact {
        id: &id,
        workspace_id: actor.workspace_id,
        name: &name,
        email: email.as_deref(),
        phone: phone.as_deref(),
        note: note.as_deref(),
    };
    let Some(contact) = repo::insert(&mut *tx, new).await.map_err(internal)? else {
        // A concurrent create with the same id committed first.
        drop(tx);
        return repeated(pool, actor.workspace_id, &id).await;
    };
    log(
        &mut tx,
        actor,
        "contact.created",
        ENTITY,
        &contact.id,
        None,
        snapshot(&contact)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok((contact, true))
}

async fn repeated(pool: &PgPool, workspace_id: &str, id: &str) -> Result<(ContactRow, bool)> {
    repo::find_with_deleted(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .map(|contact| (contact, false))
        .ok_or(AppError::IdTaken)
}

/// The live contact with this name, or a new one (DEBT-10, DEBT-14). The
/// name is compared trimmed and case-insensitively.
pub(crate) async fn find_or_create(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    name: &str,
) -> Result<ContactRow> {
    let name = clean_name(name)?;
    if let Some(found) = repo::find_by_name(&mut **tx, actor.workspace_id, &name)
        .await
        .map_err(internal)?
    {
        return Ok(found);
    }

    let id = cuid2::create_id();
    let new = NewContact {
        id: &id,
        workspace_id: actor.workspace_id,
        name: &name,
        email: None,
        phone: None,
        note: None,
    };
    let contact = repo::insert(&mut **tx, new)
        .await
        .map_err(internal)?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("a generated id was already taken")))?;
    log(
        tx,
        actor,
        "contact.created",
        ENTITY,
        &contact.id,
        None,
        snapshot(&contact)?,
    )
    .await?;
    Ok(contact)
}

/// `if_match` is the `updated_at` the client last read (D115).
pub async fn update(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    change: ContactChange<'_>,
    if_match: Option<DateTime<Utc>>,
) -> Result<ContactRow> {
    let name = change.name.map(clean_name).transpose()?;
    let email = change.email.map(|v| clean("email", v, 254)).transpose()?;
    let phone = change.phone.map(|v| clean("phone", v, 40)).transpose()?;
    let note = change.note.map(|v| clean("note", v, 2000)).transpose()?;

    let mut tx = pool.begin().await.map_err(internal)?;
    let Some(before) = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
    else {
        let not_found = AppError::ContactNotFound;
        let kind = offline::CONTACT;
        return Err(
            offline::missing(&mut *tx, actor.workspace_id, kind, id, if_match, not_found).await,
        );
    };
    offline::check(if_match, before.updated_at)?;

    let patch = ContactPatch {
        name: name.as_deref(),
        email: email.as_ref().map(|v| v.as_deref()),
        phone: phone.as_ref().map(|v| v.as_deref()),
        note: note.as_ref().map(|v| v.as_deref()),
    };
    let after = repo::update(&mut *tx, actor.workspace_id, id, &patch, if_match)
        .await
        .map_err(internal)?
        .ok_or(match if_match {
            Some(_) => AppError::Stale(None),
            None => AppError::ContactNotFound,
        })?;

    log(
        &mut tx,
        actor,
        "contact.updated",
        ENTITY,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(after)
}

/// Refused while any live debt names the contact, paid or not, so a debt's
/// history never points at nobody (CON-3).
pub async fn delete(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let before = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ContactNotFound)?;

    if debts::contact_has_debts(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::ContactHasDebts);
    }

    repo::soft_delete(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "contact.deleted",
        ENTITY,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(())
}

/// Move `id`'s live debts to `into_id`, then soft-delete `id`, as one act
/// (CON-4). Answers the contact that remains.
pub async fn merge(pool: &PgPool, actor: Actor<'_>, id: &str, into_id: &str) -> Result<ContactRow> {
    if id == into_id {
        return Err(AppError::ContactMergeSelf);
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let source = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ContactNotFound)?;
    let target = repo::find(&mut *tx, actor.workspace_id, into_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ContactNotFound)?;

    let moved = debts::move_to_contact(&mut *tx, actor.workspace_id, id, into_id)
        .await
        .map_err(internal)?;
    for debt in &moved {
        let mut before = debt.clone();
        before.contact_id = id.to_string();
        log(
            &mut tx,
            actor,
            "debt.updated",
            "debt",
            &debt.id,
            snapshot(&before)?,
            snapshot(debt)?,
        )
        .await?;
    }

    repo::soft_delete(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "contact.merged",
        ENTITY,
        id,
        snapshot(&source)?,
        Some(serde_json::json!({ "into_id": into_id, "debts_moved": moved.len() })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(target)
}

fn clean_name(raw: &str) -> Result<String> {
    let name = raw.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::validation([(
            "name",
            "Enter a name of 1 to 120 characters.",
        )]));
    }
    Ok(name.to_string())
}

/// Trimmed; empty means none.
fn clean(field: &'static str, raw: Option<&str>, max: usize) -> Result<Option<String>> {
    match raw.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok(None),
        Some(value) if value.chars().count() > max => {
            Err(AppError::validation([(field, "That is too long.")]))
        }
        Some(value) => Ok(Some(value.to_string())),
    }
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
