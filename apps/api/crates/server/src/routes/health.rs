//! Liveness and readiness.
//!
//! Both answer outside the envelope and outside OWE1: they carry no data and
//! the load balancer holds no crypto session
//! (docs/api/encryption.md#plaintext-exceptions, E1).

use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::state::AppState;

pub async fn live() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Readiness checks the one dependency the API cannot work without.
pub async fn ready(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "ok", "database": "ok" }))),
        Err(error) => {
            tracing::warn!(%error, "readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "status": "degraded", "database": "unavailable" })),
            )
        }
    }
}
