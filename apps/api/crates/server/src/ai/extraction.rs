//! Reading a document the user uploaded, and asking the AI service what is
//! on it.
//!
//! Two callers share this: the receipt confirmation flow (AI-1) and the
//! statement import job (AI-4). Both hand the AI service a document and
//! take back structure; neither hands it a tool, because the bytes are
//! attacker-controlled and the component that reads them is given nothing
//! to call (D24, SEC-21). That control lives in the AI service, and the
//! test that proves it lives there too; what this module guarantees is that
//! nothing on this side ever asks for one.
//!
//! The bytes come out of the vault, never off the request. A 10 MB image
//! cannot fit in a 1 MB body (SEC-18), so the browser uploads it as chunks
//! first and names the file here (D23).
//!
//! Nothing here logs a byte, a field or an extracted value (OPS-3).

use base64::{engine::general_purpose::STANDARD, Engine};
use oewang_clients::{storage::Storage, Owe1Client, Owe1ClientError};
use oewang_db::PgPool;
use oewang_domain::{
    files::chunk_count,
    receipt::{Quality, RawDraft},
    AppError, Result,
};
use serde::{Deserialize, Serialize};

use crate::vault::service as vault;

/// The AI service's own routes (docs/ai/service.md#endpoints).
const RECEIPT_PATH: &str = "/receipt/parse";
const EXTRACT_PATH: &str = "/import/extract";
const MAP_COLUMNS_PATH: &str = "/import/map-columns";

/// A document on its way to the model: the bytes, base64, and what they are.
#[derive(Debug, Serialize)]
pub struct Document {
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Serialize)]
struct ExtractionRequest<'a> {
    request_id: &'a str,
    workspace_id: &'a str,
    document: Document,
    workspace_currency: &'a str,
    today: String,
}

#[derive(Debug, Deserialize)]
pub struct ReceiptResponse {
    #[serde(default)]
    pub draft: RawDraft,
    #[serde(default)]
    pub quality: Quality,
}

/// One row off a statement, as the model read it. Every figure is a string
/// and stays one until Rust parses it (D12, D28).
#[derive(Debug, Deserialize)]
pub struct StatementRow {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub amount: Option<String>,
    /// `expense` or `income`. Anything else is read as an expense, because
    /// a statement row with an unreadable direction is money going out far
    /// more often than not, and the review step shows every row anyway.
    #[serde(default)]
    pub direction: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StatementResponse {
    #[serde(default)]
    pub rows: Vec<StatementRow>,
    #[serde(default)]
    pub quality: Quality,
}

/// Fetch a ready file's bytes and label them for the model.
///
/// The file is read with a workspace filter like everything else, so a file
/// id from another workspace is a 404 and not a document (VLT-4).
pub async fn document(
    pool: &PgPool,
    store: &impl Storage,
    workspace_id: &str,
    file_id: &str,
) -> Result<Document> {
    let file = vault::find(pool, workspace_id, file_id).await?;

    if file.status != "ready" {
        // An upload that never completed is not a file yet, and saying so
        // more precisely would describe a row the caller may not own.
        return Err(AppError::FileNotFound);
    }

    let mut bytes = Vec::with_capacity(file.size as usize);
    for index in 0..chunk_count(file.size) {
        bytes.extend_from_slice(
            &vault::read_chunk(pool, store, workspace_id, file_id, index).await?,
        );
    }

    Ok(Document {
        media_type: file.r#type.clone(),
        data: STANDARD.encode(&bytes),
    })
}

/// Ask for a receipt draft (AI-1).
pub async fn parse_receipt(
    ai: &Owe1Client,
    request_id: &str,
    workspace_id: &str,
    workspace_currency: &str,
    document: Document,
) -> Result<ReceiptResponse> {
    call(
        ai,
        RECEIPT_PATH,
        request_id,
        workspace_id,
        workspace_currency,
        document,
    )
    .await
}

/// Ask for statement rows (AI-4).
pub async fn extract_statement(
    ai: &Owe1Client,
    request_id: &str,
    workspace_id: &str,
    workspace_currency: &str,
    document: Document,
) -> Result<StatementResponse> {
    call(
        ai,
        EXTRACT_PATH,
        request_id,
        workspace_id,
        workspace_currency,
        document,
    )
    .await
}

#[derive(Debug, Serialize)]
struct MapColumnsRequest<'a> {
    request_id: &'a str,
    workspace_id: &'a str,
    columns: &'a [String],
    sample_rows: &'a [std::collections::BTreeMap<String, String>],
}

/// Ask which column holds what (AI-9, D28).
///
/// The model sees column names and two sample rows, and returns a mapping.
/// It never sees the file, never sees an amount it will be asked about
/// again, and cannot move a decimal point: every row is transformed
/// afterwards by `csv_import::transform`.
pub async fn map_columns(
    ai: &Owe1Client,
    request_id: &str,
    workspace_id: &str,
    columns: &[String],
    sample_rows: &[std::collections::BTreeMap<String, String>],
) -> Result<oewang_domain::csv_import::ColumnMapping> {
    ai.post(
        MAP_COLUMNS_PATH,
        &MapColumnsRequest {
            request_id,
            workspace_id,
            columns,
            sample_rows,
        },
    )
    .await
    .map_err(upstream)
}

async fn call<T: serde::de::DeserializeOwned>(
    ai: &Owe1Client,
    path: &str,
    request_id: &str,
    workspace_id: &str,
    workspace_currency: &str,
    document: Document,
) -> Result<T> {
    let body = ExtractionRequest {
        request_id,
        workspace_id,
        document,
        workspace_currency,
        // The data model carries no workspace timezone, so today is UTC
        // (docs/ai/service.md#post-chatstream-request).
        today: chrono::Utc::now().date_naive().to_string(),
    };

    ai.post(path, &body).await.map_err(upstream)
}

/// Translate the AI service's refusal into ours.
///
/// Only the code travels. An upstream message can quote the request back,
/// and the request is a receipt (OPS-3).
fn upstream(error: Owe1ClientError) -> AppError {
    let code = error.code().to_string();
    tracing::warn!(%code, "the extraction call failed");

    match code.as_str() {
        "RECEIPT_UNREADABLE" => AppError::ReceiptUnreadable,
        "STATEMENT_UNREADABLE" => AppError::StatementUnreadable,
        _ => AppError::AiUnavailable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_an_unreadable_receipt_to_its_own_code() {
        let error = Owe1ClientError::Api {
            code: "RECEIPT_UNREADABLE".into(),
            message: "unreadable".into(),
        };

        assert_eq!(upstream(error).code(), "RECEIPT_UNREADABLE");
    }

    #[test]
    fn should_map_anything_else_to_unavailable() {
        let error = Owe1ClientError::Transport("connection refused".into());

        assert_eq!(upstream(error).code(), "AI_UNAVAILABLE");
    }

    #[test]
    fn should_not_leak_an_upstream_message() {
        let error = Owe1ClientError::Api {
            code: "SOMETHING_ELSE".into(),
            message: "the receipt said Warung Tekko".into(),
        };
        let mapped = upstream(error);

        assert!(!format!("{mapped}").contains("Warung Tekko"));
    }
}
