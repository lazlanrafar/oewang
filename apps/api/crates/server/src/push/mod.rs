//! Push notifications to the mobile app (D116, PUSH-1 to PUSH-5).
//!
//! Four events push: a queued receipt or a statement import ending, a
//! budget reaching 80% and then 100% of its month, and an invitation to an
//! address that has an account. Each is sent from a spawned task after the
//! write that caused it has committed, so a push never announces something
//! that was rolled back and never delays or fails the request (PUSH-5).
//!
//! The sender is process-wide, installed once at startup, like the tracing
//! subscriber. The writes that cause a budget push live in services that
//! take a pool rather than the app state, and are reached from five surfaces
//! (web, chat, MCP, Telegram, the receipt queue); threading a sender through
//! all of them would change every signature for a side effect none of them
//! may depend on. With no FCM credentials nothing is installed and every
//! entry point returns at once.

use std::{future::Future, sync::Arc, sync::OnceLock};

use oewang_clients::PushSender;

pub mod handler;
pub mod service;

#[cfg(test)]
mod tests;

static SENDER: OnceLock<Arc<dyn PushSender>> = OnceLock::new();

/// Turn pushes on. Called once from `main`; a second call is ignored.
pub fn install(sender: Arc<dyn PushSender>) {
    let _ = SENDER.set(sender);
}

fn sender() -> Option<Arc<dyn PushSender>> {
    SENDER.get().cloned()
}

/// Run a push's work off the caller's path (PUSH-5).
///
/// Awaitable so a test can see the push its write caused before asserting;
/// in the server it only spawns, so the caller waits for nothing.
async fn dispatch(work: impl Future<Output = ()> + Send + 'static) {
    #[cfg(not(test))]
    tokio::spawn(work);
    #[cfg(test)]
    work.await;
}
