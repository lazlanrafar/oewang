//! The API binary: configuration, logging, middleware, router.
//!
//! Routes beyond health arrive with their features. OWE1 payload encryption
//! is US-004 and US-005; the auth extractor is US-008.
#![forbid(unsafe_code)]

mod accounts;
mod audit;
mod auth;
mod config;
mod fx;
mod owe1;
mod workspaces;
mod response;
mod routes;
mod state;
mod transactions;
mod vault;

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

    let mailer = match &config.resend_api_key {
        Some(key) => oewang_clients::Mailer::resend(
            key.expose().to_string(),
            config.email_from.clone(),
            config.app_url.clone(),
        ),
        None => oewang_clients::Mailer::console(config.app_url.clone()),
    };
    tracing::info!(mailer = ?mailer, "mailer ready");

    let rates = oewang_clients::RatesClient::new(
        config.fx_api_url.clone(),
        config.fx_access_key.as_ref().map(|key| key.expose().to_string()),
    );
    tracing::info!(rates = ?rates, "rate source ready");

    let files = match config.storage_backend.as_str() {
        "s3" => oewang_clients::FileStore::S3(oewang_clients::storage::S3Storage::new(
            oewang_clients::storage::S3Config {
                endpoint: config.s3_endpoint.clone(),
                bucket: config.s3_bucket.clone(),
                region: config.s3_region.clone(),
                access_key_id: config.s3_access_key_id.clone(),
                secret_access_key: config.s3_secret_access_key.expose().to_string(),
            },
        )),
        _ => oewang_clients::FileStore::Local(oewang_clients::storage::LocalStorage::new(
            config.storage_local_path.clone(),
        )),
    };
    tracing::info!(store = ?files, "file storage ready");

    let request_timeout = config.request_timeout;
    let fx_refresh_interval = config.fx_refresh_interval;
    let body_limit = config.body_limit_bytes;
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));

    let state = AppState {
        db,
        config: Arc::new(config),
        owe1_signer,
        owe1_sessions,
        mailer,
        rates,
        files,
    };

    spawn_rate_refresher(state.clone(), fx_refresh_interval);

    let app = Router::new()
        .route("/health", get(routes::health::live))
        .route("/health/ready", get(routes::health::ready))
        // Plaintext by design: a client needs the keys before it can do
        // anything, and the handshake creates them (E2, E3).
        .route("/.well-known/oewang-keys", get(owe1::handler::well_known_keys))
        .route("/v1/handshake", post(owe1::handler::handshake_handler))
        // Everything below this line is OWE1. The exception list is
        // structural: a route only skips encryption by being registered
        // above, never by matching a path inside the middleware.
        .merge(protected_routes(state.clone()))
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

/// Routes that require a live crypto session.
fn protected_routes(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/v1/session", get(owe1::handler::session_status))
        // Auth. register, login, refresh and the two reset routes are
        // unauthenticated; the rest take the token.
        .route("/v1/auth/register", post(auth::handler::register))
        .route("/v1/auth/login", post(auth::handler::login))
        .route("/v1/auth/refresh", post(auth::handler::refresh))
        .route("/v1/auth/logout", post(auth::handler::logout))
        .route("/v1/auth/logout-all", post(auth::handler::logout_all))
        .route("/v1/auth/me", get(auth::handler::me))
        .route("/v1/auth/sessions", get(auth::handler::sessions))
        .route("/v1/auth/switch-workspace", post(auth::handler::switch_workspace))
        .route("/v1/auth/forgot-password", post(auth::handler::forgot_password))
        .route("/v1/auth/reset-password", post(auth::handler::reset_password))
        // Workspaces and members.
        .route("/v1/workspaces", get(workspaces::handler::list_workspaces))
        .route(
            "/v1/workspaces/current",
            get(workspaces::handler::current_workspace)
                .patch(workspaces::handler::update_workspace)
                .delete(workspaces::handler::delete_workspace),
        )
        .route(
            "/v1/workspaces/current/members",
            get(workspaces::handler::list_members),
        )
        .route(
            "/v1/workspaces/current/members/{user_id}",
            axum::routing::patch(workspaces::handler::update_member)
                .delete(workspaces::handler::remove_member),
        )
        .route(
            "/v1/workspaces/current/invites",
            get(workspaces::handler::list_invites).post(workspaces::handler::create_invite),
        )
        .route(
            "/v1/workspaces/current/invites/{id}",
            axum::routing::delete(workspaces::handler::revoke_invite),
        )
        .route("/v1/workspaces/accept-invite", post(workspaces::handler::accept_invite))
        // Wallet groups, wallets and categories. Reads take any member;
        // writes take `AuthWrite`, which re-reads the membership row.
        .route(
            "/v1/wallet-groups",
            get(accounts::handler::list_groups).post(accounts::handler::create_group),
        )
        .route(
            "/v1/wallet-groups/{id}",
            axum::routing::patch(accounts::handler::update_group)
                .delete(accounts::handler::delete_group),
        )
        .route(
            "/v1/wallets",
            get(accounts::handler::list_wallets).post(accounts::handler::create_wallet),
        )
        .route(
            "/v1/wallets/{id}",
            get(accounts::handler::get_wallet)
                .patch(accounts::handler::update_wallet)
                .delete(accounts::handler::delete_wallet),
        )
        .route(
            "/v1/wallets/{id}/set-default",
            post(accounts::handler::set_default_wallet),
        )
        .route(
            "/v1/categories",
            get(accounts::handler::list_categories).post(accounts::handler::create_category),
        )
        .route(
            "/v1/categories/{id}",
            axum::routing::patch(accounts::handler::update_category)
                .delete(accounts::handler::delete_category),
        )
        // Exchange rates. A suggestion for the form; nothing reads it on
        // the way out (D39).
        .route("/v1/fx/rate", get(fx::handler::rate))
        // Transactions. The fixed sub-paths are registered before `{id}`,
        // so `/summary` is never read as a transaction id.
        .route(
            "/v1/transactions",
            get(transactions::handler::list).post(transactions::handler::create),
        )
        .route("/v1/transactions/summary", get(transactions::handler::summary))
        .route("/v1/transactions/export", get(transactions::handler::export))
        .route("/v1/transactions/bulk", post(transactions::handler::bulk_create))
        .route(
            "/v1/transactions/import/csv",
            post(transactions::handler::import_csv),
        )
        .route(
            "/v1/transactions/bulk-update",
            post(transactions::handler::bulk_update),
        )
        .route(
            "/v1/transactions/bulk-delete",
            post(transactions::handler::bulk_delete),
        )
        .route(
            "/v1/transactions/{id}",
            get(transactions::handler::get)
                .patch(transactions::handler::update)
                .delete(transactions::handler::delete),
        )
        .route(
            "/v1/transactions/{id}/history",
            get(transactions::handler::history),
        )
        .route(
            "/v1/transactions/{id}/items",
            get(transactions::handler::list_items).post(transactions::handler::add_item),
        )
        .route(
            "/v1/transactions/{id}/items/{item_id}",
            axum::routing::put(transactions::handler::replace_item)
                .delete(transactions::handler::delete_item),
        )
        // Files. Bytes travel as base64 inside the envelope; no signed
        // object-storage URL exists anywhere (D23, VLT-3).
        .route("/v1/vault/files", post(vault::handler::begin))
        .route(
            "/v1/vault/files/{id}",
            get(vault::handler::get_file).delete(vault::handler::delete_file),
        )
        .route(
            "/v1/vault/files/{id}/chunks/{index}",
            get(vault::handler::get_chunk).put(vault::handler::put_chunk),
        )
        .route("/v1/vault/files/{id}/complete", post(vault::handler::complete))
        .layer(axum::middleware::from_fn_with_state(
            state,
            owe1::middleware::owe1_layer,
        ))
}

/// Fill the rate cache for every pair in use (D44).
///
/// In-process rather than a worker service: it is one idempotent statement
/// loop on a fixed schedule, and a separate process to run it would be more
/// moving parts than the job is worth. The first run is immediate, so a
/// fresh deployment has rates without waiting a day.
fn spawn_rate_refresher(state: AppState, every: Duration) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(every);
        loop {
            ticker.tick().await;

            match fx::service::refresh_cache(
                &state.db,
                &state.rates,
                chrono::Utc::now().date_naive(),
            )
            .await
            {
                Ok(0) => tracing::debug!("rate cache: nothing to refresh"),
                Ok(written) => tracing::info!(written, "rate cache refreshed"),
                // A rate source that is down is not a reason to stop the
                // loop: the resolution ladder has a step for exactly this.
                Err(error) => tracing::warn!(%error, "rate cache refresh failed"),
            }
        }
    });
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
