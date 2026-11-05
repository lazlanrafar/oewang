//! The Apps page's three Telegram routes (docs/api/endpoints.md#integrations).
//!
//! Every route acts on the signed-in member's own link in the token's
//! workspace and nothing else (AUTH-4): there is no route that names
//! another member's link.

use axum::{extract::State, http::StatusCode, Json};
use oewang_domain::{AppError, Envelope};

use crate::{
    audit::Actor,
    auth::extractor::Auth,
    response::{ApiError, RequestId},
    state::AppState,
    telegram::link::{self, IssuedLink, LinkStatus},
};

/// Is the bot configured, and is this member linked.
pub async fn status(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<LinkStatus>>, ApiError> {
    let id = request_id.0;

    link::status(
        &state.db,
        state.telegram.as_ref(),
        &auth.workspace_id,
        &auth.user_id,
    )
    .await
    .map(|status| Json(Envelope::data(status, id.clone())))
    .map_err(|error| ApiError::new(error, id))
}

/// A one-time deep link to the bot. Any member (D85).
pub async fn link_token(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<IssuedLink>>, ApiError> {
    let id = request_id.0;

    let Some(bot) = state.telegram.as_ref() else {
        return Err(ApiError::new(AppError::TelegramDisabled, id));
    };

    link::issue(&state.db, bot, &auth.workspace_id, &auth.user_id)
        .await
        .map(|issued| Json(Envelope::data(issued, id.clone())))
        .map_err(|error| ApiError::new(error, id))
}

/// End this member's link. The chat is told, so it does not look like the
/// bot stopped answering for no reason.
pub async fn unlink(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<StatusCode, ApiError> {
    let id = request_id.0;

    let ended = link::unlink(&state.db, Actor::web(&auth.workspace_id, &auth.user_id))
        .await
        .map_err(|error| ApiError::new(error, id))?;

    if let (Some(row), Some(bot)) = (ended, state.telegram.clone()) {
        // Best effort, off the request: the unlink is done whether or not
        // Telegram answers.
        tokio::spawn(async move {
            if let Err(error) = bot
                .client
                .send_message(row.chat_id, crate::telegram::render::DISCONNECTED, None)
                .await
            {
                tracing::warn!(%error, "telegram unlink notice not sent");
            }
        });
    }

    Ok(StatusCode::NO_CONTENT)
}
