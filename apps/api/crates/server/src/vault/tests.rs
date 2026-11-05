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

/// The configured ceiling, out of the way of these tests: what they
/// are about is the bytes and the rows, not the daily allowance (SEC-18).
const UPLOADS_PER_DAY: i64 = 200;

const WORKSPACE: &str = "ws_test";
const USER: &str = "usr_test";

const JPEG_HEADER: [u8; 4] = [0xFF, 0xD8, 0xFF, 0xE0];

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

/// A store in memory, so a test never touches MinIO or the disk.
#[derive(Clone, Default)]
pub struct MemoryStore {
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
        self.objects
            .lock()
            .unwrap()
            .insert(key.to_string(), bytes.to_vec());
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
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, 'test@example.com', 'x')",
    )
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
    let begun = service::begin(
        pool,
        actor(),
        "receipt.jpg",
        declared,
        bytes.len() as i64,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await?;

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
    let begun = service::begin(
        &pool,
        actor(),
        "../../etc/passwd",
        "image/jpeg",
        10,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap();

    assert_eq!(begun.file.key, format!("wsp/{WORKSPACE}/{}", begun.file.id));
    assert_eq!(
        begun.file.name, ".._.._etc_passwd",
        "kept as a label, not a path"
    );
}

// -------------------------------------------------------------- the refusals

/// The control the whole upload path exists for.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_renamed_executable_and_keep_nothing(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let error = upload(
        &pool,
        &store,
        "image/jpeg",
        b"\x7fELF\x02\x01\x01\x00 pretending",
    )
    .await
    .unwrap_err();

    assert!(matches!(error, AppError::UnsupportedFileType), "{error:?}");
    assert!(
        store.keys().is_empty(),
        "a rejected upload leaves no bytes behind"
    );

    let live: i64 = sqlx::query_scalar("SELECT count(*) FROM vault_files WHERE deleted_at IS NULL")
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
    let declared = service::begin(
        &pool,
        actor(),
        "x.svg",
        "image/svg+xml",
        10,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await;
    assert!(matches!(
        declared.unwrap_err(),
        AppError::UnsupportedFileType
    ));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_file_over_the_ceiling_before_a_byte_arrives(pool: PgPool) {
    fixture(&pool).await;

    let error = service::begin(
        &pool,
        actor(),
        "big.jpg",
        "image/jpeg",
        MAX_FILE_BYTES + 1,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap_err();

    assert!(matches!(error, AppError::FileTooLarge), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_oversized_chunk(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(
        &pool,
        actor(),
        "r.jpg",
        "image/jpeg",
        1024,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap();
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

    let begun = service::begin(
        &pool,
        actor(),
        "r.jpg",
        "image/jpeg",
        1024,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap();

    let error = service::put_chunk(&pool, &store, WORKSPACE, &begun.file.id, 7, b"x")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_complete_an_upload_that_is_short(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let begun = service::begin(
        &pool,
        actor(),
        "r.jpg",
        "image/jpeg",
        2048,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap();
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

    let file = upload(&pool, &store, "image/jpeg", &jpeg(100))
        .await
        .unwrap();

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

    let begun = service::begin(
        &pool,
        actor(),
        "r.jpg",
        "image/jpeg",
        100,
        UPLOADS_PER_DAY,
        MAX_FILE_BYTES,
    )
    .await
    .unwrap();
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

    let file = upload(&pool, &store, "image/jpeg", &jpeg(100))
        .await
        .unwrap();
    let intruder = Actor::web("ws_other", USER);

    // Not "forbidden": a file in another workspace is a file that does not
    // exist (VLT-4).
    assert!(matches!(
        service::find(&pool, "ws_other", &file.id)
            .await
            .unwrap_err(),
        AppError::FileNotFound
    ));
    assert!(matches!(
        service::read_chunk(&pool, &store, "ws_other", &file.id, 0)
            .await
            .unwrap_err(),
        AppError::FileNotFound
    ));
    assert!(matches!(
        service::delete(&pool, &store, intruder, &file.id)
            .await
            .unwrap_err(),
        AppError::FileNotFound
    ));

    assert_eq!(store.keys().len(), 1, "and the bytes are still there");
}

// ----------------------------------------------------------------- delete

#[sqlx::test(migrations = "../../migrations")]
async fn should_drop_the_bytes_when_a_file_is_deleted(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let file = upload(
        &pool,
        &store,
        "image/jpeg",
        &jpeg(CHUNK_BYTES as usize + 10),
    )
    .await
    .unwrap();
    assert_eq!(store.keys().len(), 2);

    service::delete(&pool, &store, actor(), &file.id)
        .await
        .unwrap();

    assert!(
        store.keys().is_empty(),
        "a deleted receipt is not left readable"
    );
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
    assert_eq!(
        actions,
        vec!["file.created", "file.uploaded", "file.deleted"]
    );
}

// ------------------------------------------------------- the browsable vault

use oewang_db::repositories::vault::{FileFilters, FileKind, FileSort};
use oewang_domain::Page;

const PDF_BYTES: &[u8] = b"%PDF-1.7\n%some pdf body";

fn png() -> Vec<u8> {
    let image = image::RgbImage::from_pixel(64, 48, image::Rgb([10, 120, 200]));
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

/// A transaction carrying `file_id`, written as rows: what is under test is
/// the vault's view of the link, not the ledger's rules.
async fn attach_to_new_transaction(pool: &PgPool, transaction_id: &str, file_id: &str) {
    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code)
         VALUES ('w_test', $1, 'Cash', 'IDR') ON CONFLICT (id) DO NOTHING",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transactions
           (id, workspace_id, wallet_id, amount, base_amount, base_rate, base_rate_source,
            base_rate_date, date, type, name)
         VALUES ($1, $2, 'w_test', 1000, 1000, 1, 'same', current_date, now(), 'expense', 'Lunch')",
    )
    .bind(transaction_id)
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transaction_attachments (id, workspace_id, transaction_id, vault_file_id)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(format!("a_{transaction_id}"))
    .bind(WORKSPACE)
    .bind(transaction_id)
    .bind(file_id)
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_list_only_this_workspaces_ready_files_with_their_use(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();

    let photo = upload(&pool, &store, "image/png", &png()).await.unwrap();
    let statement = upload(&pool, &store, "application/pdf", PDF_BYTES)
        .await
        .unwrap();
    let gone = upload(&pool, &store, "image/jpeg", &jpeg(64))
        .await
        .unwrap();
    service::delete(&pool, &store, actor(), &gone.id)
        .await
        .unwrap();
    attach_to_new_transaction(&pool, "t_one", &photo.id).await;

    let (rows, total) = service::list(
        &pool,
        WORKSPACE,
        &FileFilters::default(),
        FileSort::Newest,
        Page::new(None, None),
    )
    .await
    .unwrap();

    assert_eq!(total, 2, "the deleted file is not listed");
    let used: Vec<(String, i64)> = rows
        .iter()
        .map(|row| (row.id.clone(), row.used_by))
        .collect();
    assert!(used.contains(&(photo.id.clone(), 1)));
    assert!(used.contains(&(statement.id.clone(), 0)));

    let (pdfs, _) = service::list(
        &pool,
        WORKSPACE,
        &FileFilters {
            kind: Some(FileKind::Pdf),
            ..FileFilters::default()
        },
        FileSort::Newest,
        Page::new(None, None),
    )
    .await
    .unwrap();
    assert_eq!(pdfs.len(), 1);
    assert_eq!(pdfs[0].id, statement.id);

    let (elsewhere, total) = service::list(
        &pool,
        "ws_other",
        &FileFilters::default(),
        FileSort::Newest,
        Page::new(None, None),
    )
    .await
    .unwrap();
    assert!(elsewhere.is_empty());
    assert_eq!(total, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_treat_search_wildcards_as_plain_characters(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    upload(&pool, &store, "image/png", &png()).await.unwrap();

    let (rows, _) = service::list(
        &pool,
        WORKSPACE,
        &FileFilters {
            search: Some("%"),
            ..FileFilters::default()
        },
        FileSort::Newest,
        Page::new(None, None),
    )
    .await
    .unwrap();

    assert!(rows.is_empty(), "a typed % matches only a literal %");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_rename_and_retag_a_file_and_audit_it(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    let file = upload(&pool, &store, "image/png", &png()).await.unwrap();

    let tags = vec![
        "Receipt".to_string(),
        " receipt ".to_string(),
        "Tax".to_string(),
    ];
    let updated = service::update(
        &pool,
        actor(),
        &file.id,
        Some("lunch/march.png"),
        Some(&tags),
    )
    .await
    .unwrap();

    assert_eq!(
        updated.name, "lunch_march.png",
        "a rename is cleaned like an upload"
    );
    assert_eq!(updated.tags, vec!["Receipt", "Tax"]);

    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_logs WHERE entity_id = $1 AND action = 'file.updated'",
    )
    .bind(&file.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    let too_many: Vec<String> = (0..11).map(|n| format!("t{n}")).collect();
    let refused = service::update(&pool, actor(), &file.id, None, Some(&too_many)).await;
    assert!(matches!(refused, Err(AppError::Validation(_))));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_detach_a_deleted_file_from_every_transaction(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    let file = upload(&pool, &store, "image/png", &png()).await.unwrap();
    attach_to_new_transaction(&pool, "t_one", &file.id).await;
    attach_to_new_transaction(&pool, "t_two", &file.id).await;

    let detail = service::detail(&pool, WORKSPACE, &file.id).await.unwrap();
    assert_eq!(detail.used_by, 2);
    assert_eq!(detail.transactions.len(), 2);

    service::delete(&pool, &store, actor(), &file.id)
        .await
        .unwrap();

    let live: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM transaction_attachments WHERE vault_file_id = $1 AND deleted_at IS NULL",
    )
    .bind(&file.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(live, 0);

    let after: serde_json::Value = sqlx::query_scalar(
        "SELECT after FROM audit_logs WHERE entity_id = $1 AND action = 'file.deleted'",
    )
    .bind(&file.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(after["detached"], 2);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_make_a_preview_once_and_keep_it(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    let file = upload(&pool, &store, "image/png", &png()).await.unwrap();

    let first = service::thumbnail(&pool, &store, WORKSPACE, &file.id)
        .await
        .unwrap();
    assert!(first.starts_with(&[0xFF, 0xD8, 0xFF]));
    assert!(store.keys().contains(&format!("{}/thumb", file.key)));

    let row = service::find(&pool, WORKSPACE, &file.id).await.unwrap();
    assert_eq!(row.thumbnail, Some(true));

    let second = service::thumbnail(&pool, &store, WORKSPACE, &file.id)
        .await
        .unwrap();
    assert_eq!(first, second, "served from storage, not made again");

    service::delete(&pool, &store, actor(), &file.id)
        .await
        .unwrap();
    assert!(store.keys().is_empty(), "the preview goes with the file");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_mark_a_pdf_as_having_no_preview(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    let file = upload(&pool, &store, "application/pdf", PDF_BYTES)
        .await
        .unwrap();

    let answer = service::thumbnail(&pool, &store, WORKSPACE, &file.id).await;
    assert!(matches!(answer, Err(AppError::ThumbnailUnavailable)));

    let row = service::find(&pool, WORKSPACE, &file.id).await.unwrap();
    assert_eq!(row.thumbnail, Some(false), "never decoded again");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_make_a_preview_for_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let store = MemoryStore::default();
    let file = upload(&pool, &store, "image/png", &png()).await.unwrap();

    let answer = service::thumbnail(&pool, &store, "ws_other", &file.id).await;
    assert!(matches!(answer, Err(AppError::FileNotFound)));
}
