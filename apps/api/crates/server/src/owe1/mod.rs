//! OWE1 server side: the signing key, crypto sessions, and the handshake.
//!
//! The protocol itself lives in `oewang_domain::owe1`, which has no
//! dependency on Axum, so the wire contract can be tested without a server.

pub mod handler;
pub mod session;
pub mod signer;

pub use session::SessionStore;
pub use signer::Owe1Signer;
