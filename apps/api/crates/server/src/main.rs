//! The API binary: router, middleware, extractors.
//!
//! Scaffold only. The router, the error envelope, configuration and logging
//! arrive in US-003; OWE1 payload encryption in US-004 and US-005.
#![forbid(unsafe_code)]

use std::net::SocketAddr;

use axum::Router;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_target(false).init();

    let port: u16 = std::env::var("API_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(3002);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    // Routes land in US-003. Binding now gives compose something to wait on.
    let app = Router::new();

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "oewang api listening");
    axum::serve(listener, app).await?;

    Ok(())
}
