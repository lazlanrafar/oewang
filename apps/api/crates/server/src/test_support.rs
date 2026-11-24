//! A whole `AppState` for tests that run a feature end to end, and the two
//! servers it talks to.
//!
//! Both are real HTTP servers on local ports. The Telegram one answers the
//! few Bot API methods the bot calls and records them. The AI one speaks
//! OWE1 through this API's own handshake and layer, so the client, the
//! seal and the envelope on the way are the production code; only the
//! model's answer is scripted.

use std::{
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::Request,
    http::Uri,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use oewang_clients::{storage::LocalStorage, FileStore, Mailer, Owe1Client, RatesClient};
use oewang_domain::{Envelope, Secret};
use serde_json::{json, Value};
use sqlx::PgPool;

use crate::{
    config::{AppEnv, Config},
    owe1::{Owe1Signer, SessionStore},
    state::AppState,
};

/// An address nothing listens on: a call to it fails at once.
pub const NOWHERE: &str = "http://127.0.0.1:9";

fn temp_path(kind: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("oewang-test-{kind}-{}", cuid2::create_id()))
}

pub fn config() -> Config {
    Config {
        app_env: AppEnv::Development,
        port: 0,
        database_url: Secret::new("unused"),
        migration_database_url: None,
        db_max_connections: 5,
        db_acquire_timeout: Duration::from_secs(5),
        db_statement_timeout: Duration::from_secs(10),
        jwt_secret: Secret::new("test-jwt-secret-that-is-long-enough-0123"),
        access_token_ttl: Duration::from_secs(900),
        refresh_token_ttl: Duration::from_secs(2_592_000),
        app_url: "http://localhost:3000".into(),
        android_origins: Vec::new(),
        resend_api_key: None,
        email_from: "oewang <no-reply@localhost>".into(),
        ai_service_url: NOWHERE.into(),
        ai_service_api_key: Secret::new("test-service-key"),
        ai_signing_public_keys: Vec::new(),
        ai_request_timeout: Duration::from_secs(10),
        fx_api_url: NOWHERE.into(),
        fx_access_key: None,
        telegram: None,
        fcm_service_account_json: None,
        storage_backend: "local".into(),
        storage_local_path: String::new(),
        s3_endpoint: String::new(),
        s3_bucket: String::new(),
        s3_region: String::new(),
        s3_access_key_id: String::new(),
        s3_secret_access_key: Secret::new(""),
        crypto_signing_key_file: temp_path("key"),
        owe1_enabled: true,
        chat_max_tool_amount: oewang_domain::tools::default_max_tool_amount(),
        request_timeout: Duration::from_secs(30),
        chat_stream_timeout: Duration::from_secs(120),
        body_limit_bytes: 1024 * 1024,
        rate_limits: Config::default_rate_limits(),
        uploads_per_day: 200,
        max_file_bytes: 10 * 1024 * 1024,
        import_row_limit: 5_000,
        trust_proxy_headers: false,
        app_relay_key: None,
    }
}

/// The state a running API holds, with its AI client pointed at `ai_url`.
pub fn state(pool: PgPool, ai_url: &str) -> AppState {
    let config = config();
    AppState {
        owe1_signer: Arc::new(
            Owe1Signer::load_or_create(&config.crypto_signing_key_file, true).unwrap(),
        ),
        owe1_sessions: SessionStore::new(),
        mailer: Mailer::console(config.app_url.clone()),
        rates: RatesClient::new(NOWHERE.into(), None),
        files: FileStore::Local(LocalStorage::new(temp_path("files"))),
        ai: Arc::new(
            Owe1Client::new(
                ai_url,
                config.ai_service_api_key.clone(),
                Vec::new(),
                true,
                config.ai_request_timeout,
            )
            .unwrap(),
        ),
        turns: crate::ai::turns::TurnStore::new(),
        mcp: crate::mcp::budget::McpBudget::new(),
        rate_limits: crate::limits::RateLimiter::new(config.rate_limits),
        telegram: None,
        webauthn: Arc::new(
            crate::passkeys::service::relying_party(&config.app_url, &config.android_origins)
                .unwrap(),
        ),
        db: pool,
        config: Arc::new(config),
    }
}

async fn serve(router: Router) -> SocketAddr {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    address
}

/// The AI service: `answer(path, body)` is the `data` of each reply.
pub async fn ai_service(pool: PgPool, answer: fn(&str, &Value) -> Value) -> String {
    let own = state(pool, NOWHERE);
    let reply = move |uri: Uri, Json(body): Json<Value>| async move {
        Json(Envelope::data(answer(uri.path(), &body), "stub"))
    };
    let router = Router::new()
        .route("/receipt/parse", post(reply))
        .route("/receipt/categorize", post(reply))
        .layer(axum::middleware::from_fn_with_state(
            own.clone(),
            crate::owe1::middleware::owe1_layer,
        ))
        .route(
            "/.well-known/oewang-keys",
            get(crate::owe1::handler::well_known_keys),
        )
        .route(
            "/v1/handshake",
            post(crate::owe1::handler::handshake_handler),
        )
        .with_state(own);
    format!("http://{}", serve(router).await)
}

/// The Bot API. Every call is recorded as (method, body); a file download
/// answers with `file`.
#[derive(Clone)]
pub struct TelegramStub {
    pub url: String,
    calls: Arc<Mutex<Vec<(String, Value)>>>,
}

impl TelegramStub {
    pub async fn serve(file: Vec<u8>) -> Self {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let recorded = calls.clone();
        let file = Bytes::from(file);

        let router = Router::new().fallback(move |request: Request| {
            let (recorded, file) = (recorded.clone(), file.clone());
            async move {
                let path = request.uri().path().to_string();
                if path.starts_with("/file/") {
                    return file.into_response();
                }
                let method = path.rsplit('/').next().unwrap_or_default().to_string();
                let body = axum::body::to_bytes(request.into_body(), 1 << 20)
                    .await
                    .unwrap();
                let body: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                recorded.lock().unwrap().push((method.clone(), body));

                let result = match method.as_str() {
                    "getFile" => {
                        json!({ "file_size": file.len(), "file_path": "photos/file_1.jpg" })
                    }
                    "sendMessage" => json!({ "message_id": 500 }),
                    _ => json!(true),
                };
                Json(json!({ "ok": true, "result": result })).into_response()
            }
        });

        Self {
            url: format!("http://{}", serve(router).await),
            calls,
        }
    }

    pub fn methods(&self) -> Vec<String> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .map(|(m, _)| m.clone())
            .collect()
    }

    /// The body of every call to `method`, in order.
    pub fn bodies(&self, method: &str) -> Vec<Value> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(called, _)| called == method)
            .map(|(_, body)| body.clone())
            .collect()
    }

    /// The text of every `sendMessage`, in order.
    pub fn texts(&self) -> Vec<String> {
        self.bodies("sendMessage")
            .iter()
            .map(|body| body["text"].as_str().unwrap_or_default().to_string())
            .collect()
    }
}
