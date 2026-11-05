//! Piping the AI service's chat stream on to the caller.
//!
//! Three things happen here and nowhere else. The events the AI service
//! sealed for hop 3 are opened by the client and re-sealed for hop 2 with
//! this hop's own sequence, because a seal binds one hop and cannot be
//! forwarded (docs/api/encryption.md#chat-stream-events). The `done` event is
//! rewritten, because `message_id` names a row the AI service does not own.
//! And the assistant's reply is persisted when the stream ends, however it
//! ends: a caller that hangs up mid-answer still gets what it was sent stored
//! (CHAT-9).
//!
//! The pump runs as a spawned task rather than inside the response body, and
//! that is the whole reason an abort persists anything: a dropped body is a
//! dropped future, which would stop without writing, while a task notices the
//! closed channel and finishes its work.
//!
//! Nothing here logs an event, a token or a reply (OPS-3).

use std::{convert::Infallible, time::Duration};

use axum::{
    http::{header, HeaderName, HeaderValue},
    response::{sse::Event, IntoResponse, Response, Sse},
};
use oewang_clients::{EventStream, Owe1ClientError, StreamEvent};
use oewang_db::PgPool;
use oewang_domain::{
    owe1::{aad, seal},
    AppError, Result,
};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::{wrappers::ReceiverStream, StreamExt};

use crate::{
    ai::{service, turns::TurnStore},
    owe1::Owe1Context,
    state::AppState,
};

/// The AI service's own route (docs/ai/service.md#endpoints).
pub const AI_STREAM_PATH: &str = "/chat/stream";

/// Enough events in flight to absorb a burst of tokens, few enough that a
/// caller that has stopped reading is noticed rather than buffered for.
const CHANNEL_DEPTH: usize = 32;

/// A proxy that holds events back turns a streaming chat into a slow
/// request, and nothing sealed is cacheable anyway.
const NO_BUFFERING: HeaderName = HeaderName::from_static("x-accel-buffering");

/// One event on its way out, before it becomes an SSE frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    pub name: String,
    pub data: String,
}

/// Open the stream and answer with it.
///
/// A failure before the stream opens is an ordinary envelope error; once it
/// is open, a failure is an event inside it
/// (docs/api/conventions.md#streaming).
pub async fn start(
    state: &AppState,
    turn: service::TurnRequest,
    context: Option<Owe1Context>,
) -> Result<Response> {
    // Encryption off is a development-only path the config already refuses
    // anywhere else. Enabled and no context would mean sealing nothing on a
    // protected hop, so it fails instead.
    if state.config.owe1_enabled && context.is_none() {
        return Err(AppError::Internal(anyhow::anyhow!(
            "no owe1 context for a sealed stream"
        )));
    }

    let workspace_id = turn.workspace_id.clone();
    let session_id = turn.session_id.clone();
    let artifacts = TurnArtifacts {
        turns: state.turns.clone(),
        turn_id: turn.turn_id.clone(),
    };

    let events = state
        .ai
        .post_stream(AI_STREAM_PATH, &turn)
        .await
        .map_err(|error| {
            // The code, never the message: an upstream message can quote the
            // request back (OPS-3).
            tracing::warn!(code = error.code(), "the chat stream could not be opened");
            AppError::AiUnavailable
        })?;

    let (sender, receiver) = mpsc::channel::<Frame>(CHANNEL_DEPTH);
    let pool = state.db.clone();
    let deadline = state.config.chat_stream_timeout;

    tokio::spawn(async move {
        pump(
            events,
            sender,
            pool,
            workspace_id,
            session_id,
            Sealer::new(context),
            deadline,
            Some(artifacts),
        )
        .await;
    });

    let body = ReceiverStream::new(receiver)
        .map(|frame| Ok::<_, Infallible>(Event::default().event(frame.name).data(frame.data)));

    Ok((
        [
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            (NO_BUFFERING, HeaderValue::from_static("no")),
        ],
        Sse::new(body),
    )
        .into_response())
}

/// Where the pump finds the canvas artifacts this turn's tools left (D88).
///
/// A channel that cannot render a canvas passes none, and what the tools
/// left is swept with the turn.
pub struct TurnArtifacts {
    pub turns: TurnStore,
    pub turn_id: String,
}

/// One event, or the end of the stream.
pub type NextEvent = Option<std::result::Result<StreamEvent, Owe1ClientError>>;

/// Where the events come from.
///
/// A trait with one real implementation, so the loop below can be driven by a
/// scripted stream in a test. Nothing in the loop may reach a model.
pub trait EventSource: Send + 'static {
    fn next(&mut self) -> impl std::future::Future<Output = NextEvent> + Send;
}

impl EventSource for EventStream {
    async fn next(&mut self) -> NextEvent {
        self.next_event().await
    }
}

/// Read, re-seal, forward, and persist what was said.
// Each argument is one independent piece of the turn; a struct bundling
// them would exist only to satisfy the count.
#[allow(clippy::too_many_arguments)]
pub async fn pump<S: EventSource>(
    mut events: S,
    sender: mpsc::Sender<Frame>,
    pool: PgPool,
    workspace_id: String,
    session_id: String,
    mut sealer: Sealer,
    deadline: Duration,
    artifacts: Option<TurnArtifacts>,
) {
    let mut reply = String::new();
    let mut usage: Option<Value> = None;
    let mut tools = ToolLog::default();

    // The stream's own deadline. The router's request timeout cannot serve
    // here: it bounds producing a response, and this response was produced
    // the moment the headers went out (SEC-19). A turn that never ends
    // would otherwise hold a task and a connection for as long as the
    // other side felt like it.
    let expires = tokio::time::Instant::now() + deadline;

    loop {
        let event = match tokio::time::timeout_at(expires, events.next()).await {
            Err(_) => {
                tracing::warn!(%workspace_id, "the chat stream ran past its deadline");
                // What arrived before the deadline is still the reply
                // (CHAT-9).
                persist(
                    &pool,
                    &workspace_id,
                    &session_id,
                    &reply,
                    usage.as_ref(),
                    &tools,
                )
                .await;
                send(&sender, &mut sealer, "error", &failure("AI_UNAVAILABLE"))
                    .await
                    .ok();
                return;
            }
            Ok(Some(Ok(event))) => event,
            Ok(Some(Err(error))) => {
                // A failed seal is the control working: a dropped or
                // reordered event must not reach the caller as if it were
                // fine (docs/api/encryption.md#chat-stream-events).
                let code = error.code().to_string();
                tracing::warn!(code = %code, "the chat stream failed");
                persist(
                    &pool,
                    &workspace_id,
                    &session_id,
                    &reply,
                    usage.as_ref(),
                    &tools,
                )
                .await;
                send(&sender, &mut sealer, "error", &failure(&code))
                    .await
                    .ok();
                return;
            }
            Ok(None) => {
                // A stream never ends silently: `done` or `error` is always
                // last (docs/ai/service.md#streaming-protocol). The other
                // side stopping without one is a failure, and what arrived
                // before it is still the reply.
                persist(
                    &pool,
                    &workspace_id,
                    &session_id,
                    &reply,
                    usage.as_ref(),
                    &tools,
                )
                .await;
                send(&sender, &mut sealer, "error", &failure("AI_UNAVAILABLE"))
                    .await
                    .ok();
                return;
            }
        };

        match event.name.as_str() {
            "token" => reply.push_str(&token_text(&event)),
            // Recorded as well as forwarded. The live turn renders these
            // events; the stored message is what a reload renders, and
            // without them the tool strip vanishes on refresh (CHAT-14).
            "tool_call" => {
                // Words before a tool call and words after it are two rounds
                // of the model, and run together they read "for you!Your".
                // A paragraph break between them is what the live turn shows.
                if !reply.trim().is_empty() {
                    reply.truncate(reply.trim_end().len());
                    reply.push_str("\n\n");
                }
                tools.called(&payload(&event));
            }
            "tool_result" => tools.answered(&payload(&event)),
            // Only this process builds artifacts. One arriving from upstream
            // is not forwarded, whatever it says (D88).
            "artifact" => continue,
            "done" => {
                usage = payload(&event).get("usage").cloned();
                let message_id = persist(
                    &pool,
                    &workspace_id,
                    &session_id,
                    &reply,
                    usage.as_ref(),
                    &tools,
                )
                .await;
                let mut done = payload(&event);
                done["message_id"] = message_id.map(Value::String).unwrap_or(Value::Null);
                send(&sender, &mut sealer, "done", &done).await.ok();
                return;
            }
            _ => {}
        }

        // Every other event travels on exactly as it arrived, re-sealed and
        // not reinterpreted: this hop pipes the protocol, it does not own it.
        if send_bytes(&sender, &mut sealer, &event.name, &event.data)
            .await
            .is_err()
        {
            // The caller hung up. What it was sent before that is still its
            // reply, and is stored (CHAT-9).
            persist(
                &pool,
                &workspace_id,
                &session_id,
                &reply,
                usage.as_ref(),
                &tools,
            )
            .await;
            return;
        }

        // The artifact follows its tool's result, so the caller already
        // knows the call succeeded when the canvas opens.
        if event.name == "tool_result" {
            if let Some(frame) = artifact_for(&event, artifacts.as_ref(), &mut tools) {
                if send(&sender, &mut sealer, "artifact", &frame)
                    .await
                    .is_err()
                {
                    persist(
                        &pool,
                        &workspace_id,
                        &session_id,
                        &reply,
                        usage.as_ref(),
                        &tools,
                    )
                    .await;
                    return;
                }
            }
        }

        if event.name == "error" {
            persist(
                &pool,
                &workspace_id,
                &session_id,
                &reply,
                usage.as_ref(),
                &tools,
            )
            .await;
            return;
        }
    }
}

/// Seals each event for the next hop, counting them as it goes.
///
/// The sequence number lives in one place for the same reason it does in the
/// Python writer: starting it anywhere but zero, or letting two streams share
/// one counter, silently breaks the detection it exists for.
pub struct Sealer {
    context: Option<Owe1Context>,
    seq: u64,
}

impl Sealer {
    pub fn new(context: Option<Owe1Context>) -> Self {
        Self { context, seq: 0 }
    }

    fn frame(&mut self, name: &str, payload: &Value) -> Result<Frame> {
        let plaintext = serde_json::to_vec(payload).map_err(|error| internal(error.into()))?;
        self.frame_bytes(name, &plaintext)
    }

    /// Plaintext when there is no context, which is the development path the
    /// OWE1 middleware already allows. The frame is otherwise identical, so
    /// one reader parses both.
    fn frame_bytes(&mut self, name: &str, plaintext: &[u8]) -> Result<Frame> {
        let data = match &self.context {
            Some(context) => {
                let sealed = seal::seal(
                    &context.keys.server_to_client,
                    &aad::stream_event(&context.session_id, &context.request_id, self.seq),
                    plaintext,
                )
                .map_err(AppError::from)?;
                serde_json::to_string(&sealed).map_err(|error| internal(error.into()))?
            }
            None => {
                String::from_utf8(plaintext.to_vec()).map_err(|error| internal(error.into()))?
            }
        };

        self.seq += 1;
        Ok(Frame {
            name: name.to_string(),
            data,
        })
    }
}

/// `Err` means the caller is gone.
async fn send(
    sender: &mpsc::Sender<Frame>,
    sealer: &mut Sealer,
    name: &str,
    payload: &Value,
) -> std::result::Result<(), ()> {
    forward(sender, sealer.frame(name, payload)).await
}

/// The same, for an event this hop passes on rather than builds.
async fn send_bytes(
    sender: &mpsc::Sender<Frame>,
    sealer: &mut Sealer,
    name: &str,
    payload: &[u8],
) -> std::result::Result<(), ()> {
    forward(sender, sealer.frame_bytes(name, payload)).await
}

async fn forward(
    sender: &mpsc::Sender<Frame>,
    frame: Result<Frame>,
) -> std::result::Result<(), ()> {
    let frame = match frame {
        Ok(frame) => frame,
        Err(error) => {
            // The failure, never the event (OPS-3).
            tracing::error!(%error, "a chat event could not be sealed");
            return Err(());
        }
    };

    sender.send(frame).await.map_err(|_| ())
}

/// The id of the stored reply, when there was one to store.
/// The turn's tool calls, in the order the model made them.
///
/// The artifact a successful tool call left, as the event the caller gets.
///
/// Recorded on the call in the tool log as well, which is what persists it
/// on the stored message: a reload reopens the same canvas (CHAT-18).
fn artifact_for(
    event: &StreamEvent,
    artifacts: Option<&TurnArtifacts>,
    tools: &mut ToolLog,
) -> Option<Value> {
    let artifacts = artifacts?;
    let result = payload(event);

    if !result.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }

    let call_id = result.get("id").and_then(Value::as_str)?;
    let artifact = artifacts.turns.take_artifact(&artifacts.turn_id, call_id)?;

    tools.artifact(call_id, artifact.kind, &artifact.payload);

    Some(json!({
        "id": call_id,
        "type": artifact.kind,
        "payload": artifact.payload,
    }))
}

/// Kept beside the reply so the stored message carries what the live turn
/// showed. A call with no result never answered: the turn ended first, and
/// it is stored that way rather than reported as finished.
#[derive(Debug, Default)]
pub struct ToolLog(Vec<Value>);

impl ToolLog {
    fn called(&mut self, payload: &Value) {
        let (Some(id), Some(name)) = (payload.get("id"), payload.get("name")) else {
            return;
        };

        self.0.push(json!({
            "id": id,
            "name": name,
            "args": payload.get("args").cloned().unwrap_or(Value::Null),
        }));
    }

    fn answered(&mut self, payload: &Value) {
        let Some(id) = payload.get("id") else { return };

        if let Some(call) = self.0.iter_mut().find(|call| call.get("id") == Some(id)) {
            call["result"] = json!({
                "ok": payload.get("ok").and_then(Value::as_bool).unwrap_or(false),
                "summary": payload.get("summary").cloned().unwrap_or(Value::Null),
            });
        }
    }

    fn artifact(&mut self, call_id: &str, kind: &str, payload: &Value) {
        if let Some(call) = self
            .0
            .iter_mut()
            .find(|call| call.get("id").and_then(Value::as_str) == Some(call_id))
        {
            call["artifact"] = json!({ "type": kind, "payload": payload });
        }
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

async fn persist(
    pool: &PgPool,
    workspace_id: &str,
    session_id: &str,
    reply: &str,
    usage: Option<&Value>,
    tools: &ToolLog,
) -> Option<String> {
    // A turn that said nothing and did nothing leaves no message. A turn
    // that ran a tool did something, even if the words never arrived.
    if reply.trim().is_empty() && tools.is_empty() {
        return None;
    }

    match service::finish_turn(pool, workspace_id, session_id, reply, usage, &tools.0).await {
        Ok(message) => Some(message.id),
        Err(error) => {
            // Logged as a failure, never with what it was carrying (OPS-3).
            tracing::error!(%error, "the assistant reply could not be stored");
            None
        }
    }
}

/// A fixed message. An upstream failure can carry anything, including the
/// prompt it was given.
fn failure(code: &str) -> Value {
    json!({ "code": code, "message": "The assistant could not finish the reply." })
}

fn payload(event: &StreamEvent) -> Value {
    match serde_json::from_slice::<Value>(&event.data) {
        Ok(value) if value.is_object() => value,
        _ => json!({}),
    }
}

fn token_text(event: &StreamEvent) -> String {
    payload(event)
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn internal(error: anyhow::Error) -> AppError {
    AppError::Internal(error)
}
