//! Associated data.
//!
//! Every sealed message is bound to its session, its direction and the
//! request it belongs to. A ciphertext moved to another endpoint, replayed
//! against another request id, or returned with a different HTTP status
//! fails to open rather than decrypting into something plausible.
//!
//! The exact byte strings are specified in docs/api/encryption.md#messages
//! and are part of the wire contract: changing one breaks every client.

/// `OWE1|req|{session}|{METHOD}|{path}|{request_id}|{timestamp}`
///
/// `path` carries no query string; the query is bound separately so an
/// intermediary cannot strip a filter unnoticed.
pub fn request(
    session_id: &str,
    method: &str,
    path: &str,
    request_id: &str,
    timestamp: i64,
) -> Vec<u8> {
    format!("OWE1|req|{session_id}|{method}|{path}|{request_id}|{timestamp}").into_bytes()
}

/// `OWE1|qry|{session}|{METHOD}|{path}|{request_id}|{timestamp}`
pub fn query(
    session_id: &str,
    method: &str,
    path: &str,
    request_id: &str,
    timestamp: i64,
) -> Vec<u8> {
    format!("OWE1|qry|{session_id}|{method}|{path}|{request_id}|{timestamp}").into_bytes()
}

/// `OWE1|res|{session}|{request_id}|{status}`
///
/// Binding the status is what stops a proxy turning a 403 into a 200 or
/// replaying one response body onto a different request.
pub fn response(session_id: &str, request_id: &str, status: u16) -> Vec<u8> {
    format!("OWE1|res|{session_id}|{request_id}|{status}").into_bytes()
}

/// `OWE1|sse|{session}|{request_id}|{seq}`
///
/// The request id doubles as the stream id, so events from two concurrent
/// streams of one session cannot be swapped, and the sequence number makes a
/// dropped or reordered event fail to open.
pub fn stream_event(session_id: &str, request_id: &str, seq: u64) -> Vec<u8> {
    format!("OWE1|sse|{session_id}|{request_id}|{seq}").into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_produce_the_specified_byte_strings() {
        assert_eq!(
            request("cs_abc", "POST", "/v1/transactions", "req_1", 1762070523),
            b"OWE1|req|cs_abc|POST|/v1/transactions|req_1|1762070523".to_vec()
        );
        assert_eq!(
            query("cs_abc", "GET", "/v1/transactions", "req_1", 1762070523),
            b"OWE1|qry|cs_abc|GET|/v1/transactions|req_1|1762070523".to_vec()
        );
        assert_eq!(
            response("cs_abc", "req_1", 201),
            b"OWE1|res|cs_abc|req_1|201".to_vec()
        );
        assert_eq!(
            stream_event("cs_abc", "req_1", 0),
            b"OWE1|sse|cs_abc|req_1|0".to_vec()
        );
    }

    #[test]
    fn should_differ_between_directions_for_the_same_request() {
        // A request body resealed as a response must not open, and vice versa.
        assert_ne!(
            request("cs_a", "GET", "/p", "r", 1),
            query("cs_a", "GET", "/p", "r", 1)
        );
        assert_ne!(
            response("cs_a", "r", 200),
            stream_event("cs_a", "r", 200)
        );
    }

    #[test]
    fn should_differ_when_any_bound_field_differs() {
        let base = request("cs_a", "GET", "/p", "r", 1);
        assert_ne!(base, request("cs_b", "GET", "/p", "r", 1));
        assert_ne!(base, request("cs_a", "POST", "/p", "r", 1));
        assert_ne!(base, request("cs_a", "GET", "/q", "r", 1));
        assert_ne!(base, request("cs_a", "GET", "/p", "s", 1));
        assert_ne!(base, request("cs_a", "GET", "/p", "r", 2));
    }

    #[test]
    fn should_bind_the_http_status() {
        assert_ne!(response("cs_a", "r", 200), response("cs_a", "r", 403));
    }
}
