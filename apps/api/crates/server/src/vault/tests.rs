//! Service tests for the vault.
//!
//! The sniffing rules are unit tested in `oewang_domain::files` without a
//! database. What is tested here is what only a database and a store can
//! answer: that a rejected upload leaves nothing behind, that a chunk
//! comes back as it went in, and that another workspace cannot reach it.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use oewang_clients::storage::{Storage, StorageError, StorageResult};
use oewang_domain::{
    files::{CHUNK_BYTES, MAX_FILE_BYTES},
    AppError,
};
use sqlx::PgPool;

use crate::{audit::Actor, vault::service};

const WORKSPACE: &str = "ws_test";
const USER: &str = "usr_test";

const JPEG_HEADER: [u8; 4] = [0xFF, 0xD8, 0xFF, 0xE0];

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

/// A store in memory, so a test never touches MinIO or the disk.
#[derive(Clone, Default)]
struct MemoryStore {
    objects: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl MemoryStore {
    fn keys(&self) -> Vec<String> {
        let mut keys: Vec<String> = self.objects.lock().unwrap().keys().cloned().collect();
        keys.sort();
        keys
    }
}

impl Storage for MemoryStore {
    async fn put(&self, key: &str, bytes: &[u8]) -> StorageResult<()> {
        self.objects.lock().unwrap().insert(key.to_string(), bytes.to_vec());
        Ok(())
    }

    async fn get(&self, key: &str) -> StorageResult<Vec<u8>> {
        self.objects
            .lock()
            .unwrap()
            .get(key)
            .cloned()
            .ok_or(StorageError::NotFound)
    }

    async fn delete(&self, key: &str) -> StorageResult<()> {
        self.objects.lock().unwrap().remove(key);
        Ok(())
    }
}

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'test@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Test', 'test', 'IDR')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_test', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();
}

/// A one-chunk file whose bytes start with a real JPEG header.
fn jpeg(size: usize) -> Vec<u8> {
    let mut bytes = JPEG_HEADER.to_vec();
    bytes.resize(size, 0x42);
    bytes
}

async fn upload(
    pool: &PgPool,
    store: &MemoryStore,
    declared: &str,
    bytes: &[u8],
) -> Result<service::VaultFileRow, AppError> {
    let begun = service::begin(pool, actor(), "receipt.jpg", declared, bytes.len() as i64).await?;

    for (index, chunk) in bytes.chunks(CHUNK_BYTES as usize).enumerate() {
        service::put_chunk(pool, store, WORKSPACE, &begun.file.id, index as u32, chunk).await?;
    }

    service::complete(pool, store, actor(), &begun.file.id).await
}

// ------------------------------------------------------------- the round trip

#[sqlx::test(migrations = "../../migrations")]
async fn should_take_a_file_in_chunks_and_give_it_back(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    // Two chunks and a bit, so assembly order matters.
    let bytes = jpeg(CHUNK_BYTES as usize * 2 + 100);
    let file = upload(&pool, &store, "image/jpeg", &bytes).await.unwrap();

    assert_eq!(file.status, "ready");
    assert_eq!(file.size, bytes.len() as i64);
    assert_eq!(file.sha256.as_ref().unwrap().len(), 64);
    assert_eq!(store.keys().len(), 3, "one object per chunk");

    let mut read = Vec::new();
    for index in 0..3 {
        read.extend(
            service::read_chunk(&pool, &store, WORKSPACE, &file.id, index)
                .await
                .unwrap(),
        );
    }
    assert_eq!(read, bytes, "what went in is what comes back");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_build_the_key_from_ids_and_never_from_the_filename(pool: PgPool) {
    fixture(&pool).await;

    // A filename that would be a path traversal if it ever became one.
    let begun = service::begin(&pool, actor(), "../../etc/passwd", "image/jpeg", 10)
        .await
        .unwrap();

    assert_eq!(begun.file.key, format!("wsp/{WORKSPACE}/{}", begun.file.id));
    assert_eq!(begun.file.name, ".._.._etc_passwd", "kept as a label, not a path");
}

// -------------------------------------------------------------- the refusals

/// The control the whole upload path exists for.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_renamed_executable_and_keep_nothing(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let error = upload(&pool, &store, "image/jpeg", b"\x7fELF\x02\x01\x01\x00 pretending")
        .await
        .unwrap_err();

    assert!(matches!(error, AppError::UnsupportedFileType), "{error:?}");
    assert!(store.keys().is_empty(), "a rejected upload leaves no bytes behind");

    let live: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM vault_files WHERE deleted_at IS NULL",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(live, 0, "and no row either");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_svg_however_it_is_declared(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    // Declared as something acceptable, and the bytes say otherwise.
    let error = upload(&pool, &store, "image/png", b"<svg onload=alert(1)></svg>")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::UnsupportedFileType));

    // Declared honestly, and refused at the door.
    let declared = service::begin(&pool, actor(), "x.svg", "image/svg+xml", 10).await;
    assert!(matches!(declared.unwrap_err(), AppError::UnsupportedFileType));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_file_over_the_ceiling_before_a_byte_arrives(pool: PgPool) {
    fixture(&pool).await;

    let error = service::begin(&pool, actor(), "big.jpg", "image/jpeg", MAX_FILE_BYTES + 1)
        .await
        .unwrap_err();

    assert!(matches!(error, AppError::FileTooLarge), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_oversized_chunk(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(&pool, actor(), "r.jpg", "image/jpeg", 1024).await.unwrap();
    let too_big = vec![0u8; CHUNK_BYTES as usize + 1];

    let error = service::put_chunk(&pool, &store, WORKSPACE, &begun.file.id, 0, &too_big)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::FileTooLarge));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_chunk_past_the_end_of_the_file(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(&pool, actor(), "r.jpg", "image/jpeg", 1024).await.unwrap();

    let error = service::put_chunk(&pool, &store, WORKSPACE, &begun.file.id, 7, b"x")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_complete_an_upload_that_is_short(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(&pool, actor(), "r.jpg", "image/jpeg", 2048).await.unwrap();
    service::put_chunk(&pool, &store, WORKSPACE, &begun.file.id, 0, &jpeg(1000))
        .await
        .unwrap();

    let error = service::complete(&pool, &store, actor(), &begun.file.id)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_reopen_a_finished_upload(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let file = upload(&pool, &store, "image/jpeg", &jpeg(100)).await.unwrap();

    // The hash is recorded; letting a chunk through now would change the
    // bytes under anything already attached to it.
    let error = service::put_chunk(&pool, &store, WORKSPACE, &file.id, 0, &jpeg(100))
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_serve_a_file_that_is_still_uploading(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(&pool, actor(), "r.jpg", "image/jpeg", 100).await.unwrap();
    service::put_chunk(&pool, &store, WORKSPACE, &begun.file.id, 0, &jpeg(100))
        .await
        .unwrap();

    let error = service::read_chunk(&pool, &store, WORKSPACE, &begun.file.id, 0)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::FileNotFound));
}

// -------------------------------------------------------------- isolation

#[sqlx::test(migrations = "../../migrations")]
async fn should_answer_not_found_across_a_workspace_boundary(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code)
         VALUES ('ws_other', 'Other', 'other', 'IDR')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let file = upload(&pool, &store, "image/jpeg", &jpeg(100)).await.unwrap();
    let intruder = Actor::web("ws_other", USER);

    // Not "forbidden": a file in another workspace is a file that does not
    // exist (VLT-4).
    assert!(matches!(
        service::find(&pool, "ws_other", &file.id).await.unwrap_err(),
        AppError::FileNotFound
    ));
    assert!(matches!(
        service::read_chunk(&pool, &store, "ws_other", &file.id, 0).await.unwrap_err(),
        AppError::FileNotFound
    ));
    assert!(matches!(
        service::delete(&pool, &store, intruder, &file.id).await.unwrap_err(),
        AppError::FileNotFound
    ));

    assert_eq!(store.keys().len(), 1, "and the bytes are still there");
}

// ----------------------------------------------------------------- delete

#[sqlx::test(migrations = "../../migrations")]
async fn should_drop_the_bytes_when_a_file_is_deleted(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let file = upload(&pool, &store, "image/jpeg", &jpeg(CHUNK_BYTES as usize + 10))
        .await
        .unwrap();
    assert_eq!(store.keys().len(), 2);

    service::delete(&pool, &store, actor(), &file.id).await.unwrap();

    assert!(store.keys().is_empty(), "a deleted receipt is not left readable");
    assert!(matches!(
        service::find(&pool, WORKSPACE, &file.id).await.unwrap_err(),
        AppError::FileNotFound
    ));

    // The row stays for the audit trail.
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id",
    )
    .bind(&file.id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(actions, vec!["file.created", "file.uploaded", "file.deleted"]);
}
