//! The API binary: configuration, logging, middleware, router.
//!
//! Routes beyond health arrive with their features. OWE1 payload encryption
//! is US-004 and US-005; the auth extractor is US-008.
#![forbid(unsafe_code)]

mod config;
mod owe1;
mod response;
mod routes;
mod state;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    http::{Request, StatusCode},
    routing::{get, post},
    Router,
};
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    compression::CompressionLayer,
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::{MakeSpan, TraceLayer},
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use oewang_domain::AppError;

use crate::{
    config::AppEnv,
    owe1::{Owe1Signer, SessionStore},
    response::{ApiError, RequestId},
    state::AppState,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Configuration first, so a missing variable fails before anything binds.
    let config = match config::Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            // Logging is not up yet, and this is the one message that must be
            // readable without it.
            eprintln!("configuration error: {error}");
            std::process::exit(1);
        }
    };

    init_tracing(config.app_env);

    tracing::info!(
        env = ?config.app_env,
        port = config.port,
        "starting oewang api"
    );

    let db = oewang_db::connect(&oewang_db::PoolConfig {
        url: config.database_url.expose().to_string(),
        max_connections: config.db_max_connections,
        acquire_timeout: config.db_acquire_timeout,
        statement_timeout: config.db_statement_timeout,
    })
    .await?;

    tracing::info!(max_connections = config.db_max_connections, "database pool ready");

    // Creating a key on first start is a development convenience. In
    // production it would silently invalidate every pinned client, so that
    // path refuses and the key must be mounted from the secret store.
    let allow_create = config.app_env == AppEnv::Development;
    let owe1_signer = match Owe1Signer::load_or_create(&config.crypto_signing_key_file, allow_create)
    {
        Ok(signer) => Arc::new(signer),
        Err(error) => {
            tracing::error!(%error, "owe1 signing key unavailable");
            std::process::exit(1);
        }
    };
    tracing::info!(kid = owe1_signer.key_id(), "owe1 signing key ready");

    let owe1_sessions = SessionStore::new();
    spawn_session_sweeper(owe1_sessions.clone());

    let request_timeout = config.request_timeout;
    let body_limit = config.body_limit_bytes;
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));

    let state = AppState {
        db,
        config: Arc::new(config),
        owe1_signer,
        owe1_sessions,
    };

    let app = Router::new()
        .route("/health", get(routes::health::live))
        .route("/health/ready", get(routes::health::ready))
        // Plaintext by design: a client needs the keys before it can do
        // anything, and the handshake creates them (E2, E3).
        .route("/.well-known/oewang-keys", get(owe1::handler::well_known_keys))
        .route("/v1/handshake", post(owe1::handler::handshake_handler))
        // An unknown path answers in the envelope like everything else, not
        // with Axum's empty 404 (docs/api/conventions.md#the-envelope).
        .fallback(not_found)
        .layer(
            // Order matters, and it is outside-in: the first layer listed
            // wraps every one below it. The body-limit and compression layers
            // sit above the trace layer because both rewrap the response body,
            // and the trace layer needs a body it can construct on its own
            // error path.
            ServiceBuilder::new()
                // Outermost: a panic becomes a 500 with a request id rather
                // than a dropped connection.
                .layer(CatchPanicLayer::new())
                // Rejects an oversized body before a handler allocates for it.
                .layer(RequestBodyLimitLayer::new(body_limit))
                .layer(CompressionLayer::new())
                .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
                .layer(TraceLayer::new_for_http().make_span_with(RequestSpan))
                .layer(PropagateRequestIdLayer::x_request_id())
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    request_timeout,
                )),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("shutdown complete");
    Ok(())
}

/// Drop expired crypto sessions so memory tracks live sessions rather than
/// every session ever opened.
fn spawn_session_sweeper(sessions: SessionStore) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(300));
        loop {
            ticker.tick().await;
            let removed = sessions.sweep(owe1::session::now_secs());
            if removed > 0 {
                tracing::debug!(removed, live = sessions.len(), "swept crypto sessions");
            }
        }
    });
}

/// Unknown path. Returns the standard envelope so a client never has to
/// special-case a bodiless 404.
async fn not_found(request: Request<axum::body::Body>) -> ApiError {
    ApiError::new(AppError::NotFound, RequestId::from_request(&request).0)
}

/// The span every request is logged under.
///
/// A struct rather than a closure because the body type at this point in the
/// stack depends on the layers above, and a closure cannot be generic over it.
///
/// Deliberately absent from the span: headers and body. Neither is ever
/// logged (OPS-3).
#[derive(Clone, Copy)]
struct RequestSpan;

impl<B> MakeSpan<B> for RequestSpan {
    fn make_span(&mut self, request: &Request<B>) -> tracing::Span {
        let request_id = request
            .headers()
            .get("x-request-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("unknown");

        tracing::info_span!(
            "request",
            method = %request.method(),
            path = %request.uri().path(),
            request_id = %request_id,
        )
    }
}

fn init_tracing(env: AppEnv) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("oewang_server=debug,tower_http=info,info"));

    let registry = tracing_subscriber::registry().with(filter);

    match env {
        // Structured JSON in production, so a log pipeline can index it.
        AppEnv::Production => registry.with(tracing_subscriber::fmt::layer().json()).init(),
        AppEnv::Development => registry
            .with(tracing_subscriber::fmt::layer().with_target(false))
            .init(),
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("shutdown signal received, draining");
    // Give in-flight requests the same budget a request itself has.
    tokio::time::sleep(Duration::from_millis(50)).await;
}
