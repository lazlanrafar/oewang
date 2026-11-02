//! The one response shape: `{ data, error, meta }`.
//!
//! All three keys are always present. See docs/api/conventions.md#the-envelope.
//! This is the plaintext; on the wire a body is encrypted (D22).

use serde::Serialize;

use crate::error::ErrorBody;

#[derive(Debug, Serialize)]
pub struct Meta {
    pub request_id: String,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub page: Option<PageMeta>,
}

#[derive(Debug, Serialize)]
pub struct PageMeta {
    pub page: u32,
    pub limit: u32,
    pub total: u64,
    pub total_pages: u32,
}

#[derive(Debug, Serialize)]
pub struct Envelope<T> {
    pub data: Option<T>,
    pub error: Option<ErrorBody>,
    pub meta: Meta,
}

impl<T> Envelope<T> {
    pub fn data(value: T, request_id: impl Into<String>) -> Self {
        Self {
            data: Some(value),
            error: None,
            meta: Meta { request_id: request_id.into(), page: None },
        }
    }

    pub fn paged(value: T, request_id: impl Into<String>, page: PageMeta) -> Self {
        Self {
            data: Some(value),
            error: None,
            meta: Meta { request_id: request_id.into(), page: Some(page) },
        }
    }
}

impl PageMeta {
    /// `limit` is capped at 100 by the conventions; callers pass the already
    /// clamped value, and `total_pages` is never zero so a client can always
    /// render "page 1 of 1".
    pub fn new(page: u32, limit: u32, total: u64) -> Self {
        let limit = limit.max(1);
        let total_pages = ((total as f64) / (limit as f64)).ceil().max(1.0) as u32;
        Self { page, limit, total, total_pages }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_always_serialize_all_three_keys() {
        let envelope = Envelope::data(serde_json::json!({"id": "x"}), "req-1");
        let value = serde_json::to_value(&envelope).unwrap();
        assert!(value.get("data").is_some());
        assert!(value.get("error").is_some(), "error must be present, as null");
        assert!(value.get("meta").is_some());
    }

    #[test]
    fn should_compute_total_pages_without_reaching_zero() {
        assert_eq!(PageMeta::new(1, 25, 0).total_pages, 1);
        assert_eq!(PageMeta::new(1, 25, 25).total_pages, 1);
        assert_eq!(PageMeta::new(1, 25, 26).total_pages, 2);
        assert_eq!(PageMeta::new(1, 25, 1043).total_pages, 42);
    }
}
