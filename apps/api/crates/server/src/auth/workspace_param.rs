//! A request that names a workspace is refused (AUTH-4).
//!
//! The workspace comes from the token's `wid` and from nothing else. Serde
//! ignores a field a struct does not declare, so without this a stray
//! `workspace_id` would be silently dropped, and a client that believed it
//! had chosen a workspace would be writing into another one. Refusing it in
//! one layer, on the plaintext after OWE1 has opened it, covers every route
//! and every future route without a handler remembering to.
//!
//! Only the top level of a JSON body and the query string are read. The two
//! routes whose whole job is to name a workspace are registered outside this
//! layer (`main.rs`), and an MCP tool's `workspace_id` sits inside the
//! JSON-RPC `params`, where `mcp::service` checks it against the token's
//! grant (D106).

use std::collections::HashMap;

use axum::{
    body::{to_bytes, Body},
    extract::Request,
    middleware::Next,
    response::{IntoResponse, Response},
};
use oewang_domain::AppError;
use serde::de::IgnoredAny;

use crate::response::{ApiError, RequestId};

const FIELD: &str = "workspace_id";

/// The ceiling the OWE1 layer already reads a body to.
const MAX_BODY: usize = 8 * 1024 * 1024;

pub async fn reject_workspace_id(request: Request, next: Next) -> Response {
    let request_id = RequestId::from_request(&request).0;
    let refuse = || ApiError::new(AppError::WorkspaceIdNotAllowed, request_id.clone());

    if request.uri().query().is_some_and(query_names_workspace) {
        return refuse().into_response();
    }

    let (parts, body) = request.into_parts();
    let Ok(bytes) = to_bytes(body, MAX_BODY).await else {
        return ApiError::new(AppError::MalformedRequest, request_id).into_response();
    };
    if body_names_workspace(&bytes) {
        return refuse().into_response();
    }

    next.run(Request::from_parts(parts, Body::from(bytes)))
        .await
}

fn query_names_workspace(query: &str) -> bool {
    form_urlencoded::parse(query.as_bytes()).any(|(key, _)| key == FIELD)
}

/// Anything that is not a JSON object is left to the handler to refuse.
/// The values are skipped, not built, so a large upload costs one pass.
fn body_names_workspace(bytes: &[u8]) -> bool {
    serde_json::from_slice::<HashMap<String, IgnoredAny>>(bytes)
        .is_ok_and(|object| object.contains_key(FIELD))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        http::{Method, StatusCode},
        routing::{get, post},
        Router,
    };
    use tower::ServiceExt;

    fn router() -> Router {
        Router::new()
            .route("/v1/transactions", get(|| async { "ok" }))
            .route("/v1/wallets", post(|body: String| async move { body }))
            .layer(axum::middleware::from_fn(reject_workspace_id))
    }

    async fn call(method: Method, uri: &str, body: &str) -> (StatusCode, String) {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8_lossy(&bytes).to_string())
    }

    /// AUTH-4
    #[tokio::test]
    async fn should_reject_a_workspace_id_in_the_body() {
        let (status, body) = call(
            Method::POST,
            "/v1/wallets",
            r#"{"name":"Cash","workspace_id":"ws_other"}"#,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body.contains("WORKSPACE_ID_NOT_ALLOWED"), "{body}");
    }

    /// AUTH-4
    #[tokio::test]
    async fn should_reject_a_workspace_id_in_the_query() {
        let (status, body) = call(
            Method::GET,
            "/v1/transactions?page=1&workspace_id=ws_other",
            "",
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body.contains("WORKSPACE_ID_NOT_ALLOWED"), "{body}");

        // Percent-encoding the key does not get it past.
        let (status, _) = call(Method::GET, "/v1/transactions?workspace%5Fid=ws_other", "").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn should_pass_a_request_that_names_no_workspace_with_its_body_intact() {
        let sent = r#"{"name":"Cash","meta":{"workspace_id":"nested is not the request's"}}"#;
        let (status, body) = call(Method::POST, "/v1/wallets", sent).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, sent);

        let (status, _) = call(
            Method::GET,
            "/v1/transactions?workspace_ids=x&q=workspace_id",
            "",
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }
}
