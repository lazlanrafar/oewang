//! The OWE1 middleware: open the request, seal the response.
//!
//! Applied to the protected router only. The plaintext exceptions are not
//! filtered by a path match inside this function; they live on a separate
//! router that never gets this layer, so the exception list is structural and
//! cannot drift from the documentation
//! (docs/api/encryption.md#plaintext-exceptions).

use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use oewang_domain::{
    owe1::{aad, seal, SealedBody},
    AppError,
};

use crate::{
    owe1::session::{self, SeenOutcome},
    response::ApiError,
    state::AppState,
};

pub const CONTENT_TYPE: &str = "application/vnd.oewang.owe1+json";

const HEADER_SESSION: &str = "x-owe-session";
const HEADER_REQUEST_ID: &str = "x-owe-request-id";
const HEADER_TIMESTAMP: &str = "x-owe-timestamp";
const HEADER_QUERY: &str = "x-owe-query";

/// The body limit already applied upstream; this is the ceiling for reading a
/// request body into memory to decrypt it.
const MAX_BODY: usize = 8 * 1024 * 1024;

pub async fn owe1_layer(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    // Plaintext mode exists only for local development and the config refuses
    // to enable it anywhere else.
    if !state.config.owe1_enabled {
        return next.run(request).await;
    }

    match handle(&state, request, next).await {
        Ok(response) => response,
        Err(error) => error.into_response(),
    }
}

async fn handle(
    state: &AppState,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let headers = request.headers().clone();
    let request_id = header(&headers, HEADER_REQUEST_ID).unwrap_or_default();

    let fail = |error: AppError| ApiError::new(error, request_id.clone());

    let session_id = header(&headers, HEADER_SESSION)
        .ok_or_else(|| fail(AppError::CryptoSessionUnknown))?;
    if request_id.is_empty() {
        return Err(fail(AppError::CryptoDecryptFailed));
    }

    let timestamp: i64 = header(&headers, HEADER_TIMESTAMP)
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| fail(AppError::CryptoDecryptFailed))?;

    let now = session::now_secs();
    if !session::timestamp_acceptable(timestamp, now) {
        // The server's own time travels in the error so the client can
        // correct its offset and retry once.
        return Err(fail(AppError::CryptoClockSkew { server_time: now }));
    }

    let keys = state
        .owe1_sessions
        .keys(&session_id, now)
        .ok_or_else(|| fail(AppError::CryptoSessionUnknown))?;

    // Freshness came from the timestamp above; this catches a replay inside
    // the window, which the timestamp alone cannot.
    match state.owe1_sessions.observe(&session_id, &request_id, now) {
        Some(SeenOutcome::Fresh) => {}
        Some(SeenOutcome::Replay) => return Err(fail(AppError::CryptoReplayDetected)),
        None => return Err(fail(AppError::CryptoSessionUnknown)),
    }

    let (mut parts, body) = request.into_parts();
    let method = parts.method.as_str().to_string();
    let path = parts.uri.path().to_string();

    // A plaintext query string on a protected route is refused rather than
    // ignored, so a stripped filter cannot pass unnoticed.
    if parts.uri.query().is_some() {
        return Err(fail(AppError::CryptoQueryNotEncrypted));
    }

    let encrypted_query = header(&headers, HEADER_QUERY)
        .ok_or_else(|| fail(AppError::CryptoQueryNotEncrypted))?;
    let query = open_field(
        &keys.client_to_server,
        &aad::query(&session_id, &method, &path, &request_id, timestamp),
        &encrypted_query,
    )
    .map_err(fail)?;

    if !query.is_empty() {
        let rebuilt = format!("{path}?{query}");
        parts.uri = rebuilt
            .parse()
            .map_err(|_| fail(AppError::CryptoDecryptFailed))?;
    }

    let sealed_bytes = to_bytes(body, MAX_BODY)
        .await
        .map_err(|_| fail(AppError::CryptoDecryptFailed))?;

    let plaintext_body = if sealed_bytes.is_empty() {
        Vec::new()
    } else {
        let sealed: SealedBody = serde_json::from_slice(&sealed_bytes)
            .map_err(|_| fail(AppError::CryptoDecryptFailed))?;
        seal::open(
            &keys.client_to_server,
            &aad::request(&session_id, &method, &path, &request_id, timestamp),
            &sealed,
        )
        .map_err(|_| fail(AppError::CryptoDecryptFailed))?
    };

    let mut inner = Request::from_parts(parts, Body::from(plaintext_body));
    // Handlers that parse JSON need the plain content type, not ours.
    inner.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    let response = next.run(inner).await;
    seal_response(&keys.server_to_client, &session_id, &request_id, response).await
}

/// Seal the response, binding the status so a proxy cannot turn a 403 into a
/// 200 or move one body onto another request.
///
/// A transport error is left in plaintext: the caller may hold no working key,
/// which is the whole reason it is an error.
async fn seal_response(
    key: &[u8; 32],
    session_id: &str,
    request_id: &str,
    response: Response,
) -> Result<Response, ApiError> {
    let (parts, body) = response.into_parts();
    let status = parts.status;

    if is_transport_error(&parts.headers, status) {
        return Ok(Response::from_parts(parts, body));
    }

    let plaintext = to_bytes(body, MAX_BODY)
        .await
        .map_err(|_| ApiError::new(AppError::Internal(anyhow::anyhow!("response body")), request_id))?;

    let sealed = seal::seal(
        key,
        &aad::response(session_id, request_id, status.as_u16()),
        &plaintext,
    )
    .map_err(|_| {
        ApiError::new(AppError::Internal(anyhow::anyhow!("seal failed")), request_id)
    })?;

    let encoded = serde_json::to_vec(&sealed).map_err(|_| {
        ApiError::new(AppError::Internal(anyhow::anyhow!("encode failed")), request_id)
    })?;

    let mut out = Response::from_parts(parts, Body::from(encoded));
    let headers = out.headers_mut();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static(CONTENT_TYPE),
    );
    headers.remove(axum::http::header::CONTENT_LENGTH);
    // Nothing encrypted is cacheable, and every protected route is dynamic
    // and workspace-scoped anyway.
    headers.insert(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    );

    Ok(out)
}

/// Marked by `ApiError` when it builds a transport failure, so this does not
/// have to re-parse the body to decide.
fn is_transport_error(headers: &HeaderMap, status: StatusCode) -> bool {
    status.is_client_error() && headers.contains_key(crate::response::TRANSPORT_ERROR_HEADER)
}

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

/// Open a header-carried field such as the query string, encoded as
/// `nonce.ciphertext`.
fn open_field(
    key: &[u8; 32],
    aad: &[u8],
    value: &str,
) -> Result<String, AppError> {
    if value.is_empty() {
        return Ok(String::new());
    }

    let (nonce, ciphertext) = value
        .split_once('.')
        .ok_or(AppError::CryptoDecryptFailed)?;

    let body = SealedBody { n: nonce.to_string(), c: ciphertext.to_string() };
    let opened = seal::open(key, aad, &body).map_err(|_| AppError::CryptoDecryptFailed)?;

    String::from_utf8(opened).map_err(|_| AppError::CryptoDecryptFailed)
}

#[cfg(test)]
mod tests {
    use oewang_domain::owe1::handshake;

    use super::*;

    const KEY: [u8; 32] = [9u8; 32];

    fn sealed_field(aad: &[u8], plaintext: &[u8]) -> String {
        let body = seal::seal(&KEY, aad, plaintext).unwrap();
        format!("{}.{}", body.n, body.c)
    }

    #[test]
    fn should_open_an_encrypted_query_field() {
        let aad = aad::query("cs_a", "GET", "/v1/transactions", "req_1", 1);
        let field = sealed_field(&aad, b"type=expense&page=2");
        assert_eq!(open_field(&KEY, &aad, &field).unwrap(), "type=expense&page=2");
    }

    #[test]
    fn should_accept_an_empty_query_field() {
        // The header is required even when the query is empty, so an
        // intermediary cannot strip a filter unnoticed.
        let aad = aad::query("cs_a", "GET", "/v1/transactions", "req_1", 1);
        let field = sealed_field(&aad, b"");
        assert_eq!(open_field(&KEY, &aad, &field).unwrap(), "");
    }

    #[test]
    fn should_reject_a_query_field_without_a_separator() {
        let aad = aad::query("cs_a", "GET", "/p", "req_1", 1);
        let error = open_field(&KEY, &aad, "no-separator-here").unwrap_err();
        assert_eq!(error.code(), "CRYPTO_DECRYPT_FAILED");
    }

    #[test]
    fn should_reject_a_query_field_bound_to_another_request() {
        let field = sealed_field(
            &aad::query("cs_a", "GET", "/p", "req_1", 1),
            b"page=2",
        );
        let other = aad::query("cs_a", "GET", "/p", "req_2", 1);
        assert_eq!(
            open_field(&KEY, &other, &field).unwrap_err().code(),
            "CRYPTO_DECRYPT_FAILED"
        );
    }

    #[test]
    fn should_reject_a_tampered_query_field() {
        let aad = aad::query("cs_a", "GET", "/p", "req_1", 1);
        let field = sealed_field(&aad, b"page=2");
        let (nonce, ciphertext) = field.split_once('.').unwrap();
        let mut bytes: Vec<char> = ciphertext.chars().collect();
        bytes[0] = if bytes[0] == 'A' { 'B' } else { 'A' };
        let tampered = format!("{nonce}.{}", bytes.into_iter().collect::<String>());

        assert_eq!(
            open_field(&KEY, &aad, &tampered).unwrap_err().code(),
            "CRYPTO_DECRYPT_FAILED"
        );
    }

    #[test]
    fn should_reject_a_query_field_that_is_not_base64() {
        let aad = aad::query("cs_a", "GET", "/p", "req_1", 1);
        let bad = format!("{}.{}", handshake::encode(&[0u8; 12]), "not base64!!");
        assert_eq!(
            open_field(&KEY, &aad, &bad).unwrap_err().code(),
            "CRYPTO_DECRYPT_FAILED"
        );
    }
}
