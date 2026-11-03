//! Turning domain results into HTTP.
//!
//! The one place `AppError` becomes a status and a body. Handlers return
//! `Result<_, AppError>` and never build an error response themselves.

use axum::{
    extract::Request,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use oewang_domain::{AppError, Envelope};

/// Marks a response the OWE1 middleware must leave in plaintext, because the
/// caller may hold no working key (docs/api/encryption.md#errors).
pub const TRANSPORT_ERROR_HEADER: &str = "x-owe-transport-error";

/// The request id, carried by `tower_http`'s layer and echoed in every
/// envelope so a log line and a client report name the same request.
#[derive(Debug, Clone)]
pub struct RequestId(pub String);

impl RequestId {
    pub fn from_request(request: &Request) -> Self {
        Self(Self::from_parts(request.headers()))
    }

    fn from_parts(headers: &axum::http::HeaderMap) -> String {
        headers
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown")
            .to_string()
    }
}

/// Extractable, so a handler can name the request it is answering without
/// reaching for the whole `Request`.
impl<S: Send + Sync> axum::extract::FromRequestParts<S> for RequestId {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(Self::from_parts(&parts.headers)))
    }
}

/// An error on its way out, paired with the request it belongs to.
pub struct ApiError {
    pub error: AppError,
    pub request_id: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status =
            StatusCode::from_u16(self.error.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let is_transport = self.error.is_transport();

        if let AppError::Internal(source) = &self.error {
            // Logged here and nowhere else, so the source cannot reach a body
            // by accident.
            tracing::error!(
                request_id = %self.request_id,
                error = %source,
                cause = ?source.source(),
                "unhandled error"
            );
        }

        let body = Envelope::<()> {
            data: None,
            error: Some(self.error.to_body(self.request_id.clone())),
            meta: oewang_domain::Meta {
                request_id: self.request_id,
                page: None,
            },
        };

        let mut response = (status, Json(body)).into_response();

        if is_transport {
            response
                .headers_mut()
                .insert(TRANSPORT_ERROR_HEADER, HeaderValue::from_static("1"));
        }

        if let AppError::RateLimited { retry_after_secs } = self.error {
            if let Ok(value) = HeaderValue::from_str(&retry_after_secs.to_string()) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
        }

        response
    }
}

impl ApiError {
    pub fn new(error: AppError, request_id: impl Into<String>) -> Self {
        Self {
            error,
            request_id: request_id.into(),
        }
    }
}
