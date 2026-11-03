//! Uploading, serving and deleting file bytes.
//!
//! A file arrives as chunks and is stored as chunks, one object each,
//! because that is also how it is served back (D23). Nothing assembles the
//! whole file except the hash at completion, and nothing ever hands out a
//! URL to object storage.

use oewang_clients::storage::{chunk_key, Storage, StorageError};
use oewang_db::{repositories::vault, PgPool};
use oewang_domain::{
    files::{chunk_count, storage_key, validate_declaration, verify_type, CHUNK_BYTES},
    AppError, Result,
};
use sha2::{Digest, Sha256};

use crate::audit::{log, snapshot, Actor};

pub use oewang_db::repositories::vault::VaultFileRow;

const ENTITY: &str = "file";

#[derive(Debug)]
pub struct BegunUpload {
    pub file: VaultFileRow,
    pub chunk_size: i64,
    pub chunk_count: u32,
}

/// Reserve a file and tell the client how to send it.
///
/// Nothing is stored yet. The row exists so a chunk can be addressed, and
/// it stays `pending` until every chunk has arrived and the bytes have
/// been checked against what was declared.
pub async fn begin(
    pool: &PgPool,
    actor: Actor<'_>,
    name: &str,
    content_type: &str,
    size_bytes: i64,
    uploads_per_day: i64,
    max_file_bytes: i64,
) -> Result<BegunUpload> {
    let declared = validate_declaration(content_type, size_bytes, max_file_bytes)?;

    // A day's worth, counted from the rows (SEC-18). The ceiling exists
    // because storage is the one thing a member can spend without a model
    // call and without an admin noticing.
    if uploads_per_day > 0
        && vault::count_files_today(pool, actor.workspace_id)
            .await
            .map_err(internal)?
            >= uploads_per_day
    {
        return Err(AppError::RateLimited {
            retry_after_secs: 3600,
        });
    }

    let id = cuid2::create_id();
    // Generated from ids, never from the filename (SEC-13). The filename
    // is stored as data and used for nothing else.
    let key = storage_key(actor.workspace_id, &id);

    let mut tx = pool.begin().await.map_err(internal)?;

    let file = vault::insert_file(
        &mut *tx,
        &id,
        actor.workspace_id,
        clean_name(name).as_str(),
        &key,
        size_bytes,
        &declared,
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "file.created",
        ENTITY,
        &file.id,
        None,
        snapshot(&file)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    Ok(BegunUpload {
        chunk_size: CHUNK_BYTES,
        chunk_count: chunk_count(size_bytes),
        file,
    })
}

/// Store one chunk.
///
/// The index is part of the request path, which the OWE1 associated data
/// already covers, so a chunk cannot be moved to another position in
/// flight (docs/api/encryption.md#file-bytes).
pub async fn put_chunk(
    pool: &PgPool,
    store: &impl Storage,
    workspace_id: &str,
    file_id: &str,
    index: u32,
    bytes: &[u8],
) -> Result<()> {
    let file = require_pending(pool, workspace_id, file_id).await?;

    if index >= chunk_count(file.size) {
        return Err(AppError::validation([(
            "index",
            "That chunk is past the end of the file.",
        )]));
    }
    if bytes.len() as i64 > CHUNK_BYTES {
        return Err(AppError::FileTooLarge);
    }

    store
        .put(&chunk_key(&file.key, index), bytes)
        .await
        .map_err(storage_failed)
}

/// Verify every chunk, check the type, record the hash.
///
/// The type check happens here rather than on the first chunk because a
/// client could otherwise send a valid header first and anything it liked
/// afterwards. The hash is over the whole file, in order.
pub async fn complete(
    pool: &PgPool,
    store: &impl Storage,
    actor: Actor<'_>,
    file_id: &str,
) -> Result<VaultFileRow> {
    let file = require_pending(pool, actor.workspace_id, file_id).await?;
    let total = chunk_count(file.size);

    let mut hasher = Sha256::new();
    let mut seen: i64 = 0;
    let mut head = Vec::new();

    for index in 0..total {
        let bytes = store
            .get(&chunk_key(&file.key, index))
            .await
            .map_err(|error| match error {
                // A missing chunk is an unfinished upload, not a fault.
                StorageError::NotFound => {
                    AppError::validation([("chunks", "Some chunks have not arrived yet.")])
                }
                other => storage_failed(other),
            })?;

        if head.len() < 512 {
            head.extend_from_slice(&bytes[..bytes.len().min(512 - head.len())]);
        }
        seen += bytes.len() as i64;
        hasher.update(&bytes);
    }

    if seen != file.size {
        return Err(AppError::validation([(
            "size_bytes",
            "The bytes received do not add up to the size declared.",
        )]));
    }

    // The declared type against the evidence (SEC-12). A mismatch takes
    // the file with it: a rejected upload leaves nothing behind.
    if verify_type(&file.r#type, &head).is_err() {
        discard(pool, store, actor, &file, total).await?;
        return Err(AppError::UnsupportedFileType);
    }

    let digest = hex(&hasher.finalize());

    let mut tx = pool.begin().await.map_err(internal)?;
    let ready = vault::mark_ready(&mut *tx, actor.workspace_id, file_id, &digest)
        .await
        .map_err(internal)?
        .ok_or(AppError::FileNotFound)?;

    log(
        &mut tx,
        actor,
        "file.uploaded",
        ENTITY,
        file_id,
        snapshot(&file)?,
        snapshot(&ready)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(ready)
}

/// One chunk back, for a client assembling the file (D23, VLT-3).
pub async fn read_chunk(
    pool: &PgPool,
    store: &impl Storage,
    workspace_id: &str,
    file_id: &str,
    index: u32,
) -> Result<Vec<u8>> {
    let file = find(pool, workspace_id, file_id).await?;

    if file.status != "ready" {
        return Err(AppError::FileNotFound);
    }
    if index >= chunk_count(file.size) {
        return Err(AppError::FileNotFound);
    }

    store
        .get(&chunk_key(&file.key, index))
        .await
        .map_err(|error| match error {
            StorageError::NotFound => AppError::FileNotFound,
            other => storage_failed(other),
        })
}

pub async fn find(pool: &PgPool, workspace_id: &str, file_id: &str) -> Result<VaultFileRow> {
    vault::find_file(pool, workspace_id, file_id)
        .await
        .map_err(internal)?
        // A file in another workspace and a file that never existed give
        // the same answer (VLT-4).
        .ok_or(AppError::FileNotFound)
}

/// Soft delete the row and drop the bytes.
///
/// The row stays for the audit trail; the bytes do not, because keeping a
/// receipt nobody can reach is the worst of both.
pub async fn delete(
    pool: &PgPool,
    store: &impl Storage,
    actor: Actor<'_>,
    file_id: &str,
) -> Result<()> {
    let file = find(pool, actor.workspace_id, file_id).await?;
    let total = chunk_count(file.size);

    discard(pool, store, actor, &file, total).await
}

async fn discard(
    pool: &PgPool,
    store: &impl Storage,
    actor: Actor<'_>,
    file: &VaultFileRow,
    total: u32,
) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    vault::soft_delete_file(&mut *tx, actor.workspace_id, &file.id)
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "file.deleted",
        ENTITY,
        &file.id,
        snapshot(file)?,
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    // After the commit on purpose: the row is the record, and a storage
    // failure here must not undo a delete the user already saw succeed.
    for index in 0..total {
        if let Err(error) = store.delete(&chunk_key(&file.key, index)).await {
            tracing::warn!(file = %file.id, index, %error, "chunk left behind after delete");
        }
    }

    Ok(())
}

async fn require_pending(pool: &PgPool, workspace_id: &str, file_id: &str) -> Result<VaultFileRow> {
    let file = find(pool, workspace_id, file_id).await?;

    if file.status == "ready" {
        // A finished upload is not reopened: the hash has been recorded
        // and anything already attached to it would silently change.
        return Err(AppError::validation([(
            "status",
            "That upload is already complete.",
        )]));
    }

    Ok(file)
}

/// Keep the filename as a label, with nothing in it that reads as a path.
fn clean_name(name: &str) -> String {
    let trimmed = name.trim().replace(['/', '\\', '\0'], "_");
    let bounded: String = trimmed.chars().take(200).collect();

    if bounded.is_empty() {
        "file".to_string()
    } else {
        bounded
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn storage_failed(error: StorageError) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_keep_a_filename_as_a_label_and_not_as_a_path() {
        assert_eq!(clean_name("receipt.jpg"), "receipt.jpg");
        assert_eq!(clean_name("../../etc/passwd"), ".._.._etc_passwd");
        assert_eq!(clean_name(r"C:\Windows\system32"), "C:_Windows_system32");
        assert_eq!(clean_name("   "), "file");
        assert_eq!(clean_name(&"x".repeat(500)).len(), 200);
    }
}
