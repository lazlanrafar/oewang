//! `POST /v1/handshake` and `GET /.well-known/oewang-keys`.
//!
//! Both are plaintext exceptions (docs/api/encryption.md#plaintext-exceptions,
//! E2 and E3). The handshake creates the keys, so it cannot itself be
//! encrypted; it is signed instead.

use axum::{extract::State, Json};
use oewang_domain::{
    owe1::{check_version, handshake, Owe1Error},
    AppError,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use x25519_dalek::{PublicKey, StaticSecret};

use crate::{owe1::session, response::ApiError, state::AppState};

#[derive(Debug, Deserialize)]
pub struct HandshakeRequest {
    pub v: u8,
    pub client_public_key: String,
    pub client_nonce: String,
}

#[derive(Debug, Serialize)]
pub struct HandshakeResponse {
    pub v: u8,
    pub session_id: String,
    pub server_public_key: String,
    pub server_nonce: String,
    pub server_time: i64,
    pub expires_at: i64,
    pub kid: String,
    pub signature: String,
}

#[derive(Debug, Serialize)]
pub struct PublishedKey {
    pub kid: String,
    pub public_key: String,
    pub algorithm: &'static str,
}

/// The pinned public keys. Plaintext and unauthenticated by design: a client
/// needs them before it can do anything else.
pub async fn well_known_keys(State(state): State<AppState>) -> Json<Vec<PublishedKey>> {
    Json(vec![PublishedKey {
        kid: state.owe1_signer.key_id().to_string(),
        public_key: handshake::encode(&state.owe1_signer.public_key()),
        algorithm: "Ed25519",
    }])
}

pub async fn handshake_handler(
    State(state): State<AppState>,
    request_id: crate::response::RequestId,
    Json(body): Json<HandshakeRequest>,
) -> Result<Json<HandshakeResponse>, ApiError> {
    let result = run_handshake(&state, body);
    result.map(Json).map_err(|error| {
        ApiError::new(AppError::from(error), request_id.0.clone())
    })
}

fn run_handshake(
    state: &AppState,
    body: HandshakeRequest,
) -> Result<HandshakeResponse, Owe1Error> {
    check_version(body.v)?;

    let client_public_bytes =
        handshake::decode_fixed::<32>(&body.client_public_key, "client_public_key")?;
    let client_nonce = handshake::decode_fixed::<16>(&body.client_nonce, "client_nonce")?;

    // Ephemeral on this side too, so a leak of the signing key does not
    // retroactively expose past sessions.
    let mut server_secret_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut server_secret_bytes);
    let server_secret = StaticSecret::from(server_secret_bytes);
    let server_public = PublicKey::from(&server_secret);

    let mut server_nonce = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut server_nonce);

    let session_id = handshake::new_session_id();
    let client_public = PublicKey::from(client_public_bytes);

    // Rejects a low-order point: accepting one would mean deriving a key the
    // attacker already knows.
    let keys = handshake::derive_keys(
        &server_secret,
        &client_public,
        &client_nonce,
        &server_nonce,
        &session_id,
    )?;

    let server_time = session::now_secs();
    let expires_at = server_time + session::SESSION_TTL.as_secs() as i64;

    let transcript = handshake::transcript(
        &client_public_bytes,
        &server_public.to_bytes(),
        &client_nonce,
        &server_nonce,
        &session_id,
        expires_at,
        server_time,
    );
    let signature = state.owe1_signer.sign(&transcript);

    state
        .owe1_sessions
        .insert(session_id.clone(), keys, expires_at);

    // The ephemeral private key is dropped here and never stored.
    Ok(HandshakeResponse {
        v: handshake::VERSION,
        session_id,
        server_public_key: handshake::encode(&server_public.to_bytes()),
        server_nonce: handshake::encode(&server_nonce),
        server_time,
        expires_at,
        kid: state.owe1_signer.key_id().to_string(),
        signature: handshake::encode(&signature),
    })
}

#[derive(Debug, Serialize)]
pub struct SessionStatus {
    pub session_id: String,
    pub expires_at: i64,
    pub server_time: i64,
}

/// Report the caller's own crypto session.
///
/// The first protected route: reaching it at all proves the caller holds live
/// session keys, so a client can use it to check a session before committing
/// to a real request. It carries no workspace data, so it needs no auth.
pub async fn session_status(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<SessionStatus>, ApiError> {
    let session_id = headers
        .get("x-owe-session")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();

    let now = session::now_secs();
    let expires_at = state
        .owe1_sessions
        .expires_at(&session_id)
        .unwrap_or(now);

    Ok(Json(SessionStatus { session_id, expires_at, server_time: now }))
}
