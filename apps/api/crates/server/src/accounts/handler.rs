//! Wallet, wallet-group and category routes.
//!
//! Handlers parse, call one service and map to HTTP. Every rule lives in
//! `service.rs`; nothing here opens a transaction or touches `sqlx`.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use oewang_db::repositories::{
    categories::CategoryRow,
    wallets::{WalletGroupRow, WalletListRow, WalletRow},
};
use oewang_domain::{Envelope, Result};
use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize};

use crate::{
    accounts::service::{self, Actor, NewWalletInput, WalletPatchInput},
    auth::extractor::{Auth, AuthWrite},
    response::{ApiError, RequestId},
    state::AppState,
};

// ------------------------------------------------------------------- views

#[derive(Debug, Serialize)]
pub struct WalletGroupView {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct WalletView {
    pub id: String,
    pub group_id: Option<String>,
    /// Joined in the list query so the settings screen can group without a
    /// second request. Null on a single-wallet read, which has no join.
    pub group_name: Option<String>,
    pub name: String,
    pub currency_code: String,
    /// A string on the wire, never a JavaScript number (D12). The balance is
    /// read-only: it moves only as a consequence of a transaction (TXN-3).
    #[serde(with = "rust_decimal::serde::str")]
    pub balance: Decimal,
    pub is_included_in_totals: bool,
    pub is_default: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CategoryView {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

impl From<WalletGroupRow> for WalletGroupView {
    fn from(row: WalletGroupRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            sort_order: row.sort_order,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<WalletListRow> for WalletView {
    fn from(row: WalletListRow) -> Self {
        Self {
            id: row.id,
            group_id: row.group_id,
            group_name: row.group_name,
            name: row.name,
            currency_code: row.currency_code,
            balance: row.balance,
            is_included_in_totals: row.is_included_in_totals,
            is_default: row.is_default,
            sort_order: row.sort_order,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<WalletRow> for WalletView {
    fn from(row: WalletRow) -> Self {
        Self {
            id: row.id,
            group_id: row.group_id,
            group_name: None,
            name: row.name,
            currency_code: row.currency_code,
            balance: row.balance,
            is_included_in_totals: row.is_included_in_totals,
            is_default: row.is_default,
            sort_order: row.sort_order,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<CategoryRow> for CategoryView {
    fn from(row: CategoryRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            r#type: row.r#type,
            sort_order: row.sort_order,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

// ---------------------------------------------------------------- requests

#[derive(Debug, Deserialize)]
pub struct WalletGroupBody {
    pub name: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct WalletGroupPatchBody {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWalletBody {
    pub name: String,
    pub group_id: Option<String>,
    /// Absent means the workspace currency (WAL-5).
    pub currency_code: Option<String>,
    pub is_included_in_totals: Option<bool>,
    pub sort_order: Option<i32>,
}

/// `balance` and `is_default` are absent on purpose: balance is never
/// writable (TXN-3), and the default flag moves through `set-default` alone.
#[derive(Debug, Deserialize, PartialEq, Eq)]
pub struct UpdateWalletBody {
    pub name: Option<String>,
    /// Three states, and all three are meaningful: absent leaves the group
    /// alone, `null` detaches the wallet, a string moves it.
    #[serde(default, deserialize_with = "explicit_null")]
    pub group_id: Option<Option<String>>,
    pub currency_code: Option<String>,
    pub is_included_in_totals: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryBody {
    pub name: String,
    pub r#type: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryBody {
    pub name: Option<String>,
    pub r#type: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CategoryQuery {
    pub r#type: Option<String>,
}

/// Tells an absent key apart from an explicit `null`.
///
/// `Option<Option<T>>` alone cannot: serde fills a missing key with `None`,
/// which is the same value an explicit null produces. With `default` plus
/// this function, a missing key stays `None` and a present null becomes
/// `Some(None)`.
fn explicit_null<'de, T, D>(deserializer: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

// ---------------------------------------------------------- wallet groups

pub async fn list_groups(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<WalletGroupView>>>, ApiError> {
    let groups = service::list_groups(&state.db, &auth.workspace_id)
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(
        groups.into_iter().map(Into::into).collect(),
        request_id.0,
    )))
}

pub async fn create_group(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<WalletGroupBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<WalletGroupView>>), ApiError> {
    created(
        service::create_group(&state.db, actor(&auth), &body.name, body.sort_order).await,
        request_id,
    )
}

pub async fn update_group(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
    Json(body): Json<WalletGroupPatchBody>,
) -> std::result::Result<Json<Envelope<WalletGroupView>>, ApiError> {
    ok(
        service::update_group(
            &state.db,
            actor(&auth),
            &id,
            body.name.as_deref(),
            body.sort_order,
        )
        .await,
        request_id,
    )
}

pub async fn delete_group(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    no_content(
        service::delete_group(&state.db, actor(&auth), &id).await,
        request_id,
    )
}

// ---------------------------------------------------------------- wallets

pub async fn list_wallets(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<WalletView>>>, ApiError> {
    let rows = service::list_wallets(&state.db, &auth.workspace_id)
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(
        rows.into_iter().map(Into::into).collect(),
        request_id.0,
    )))
}

pub async fn get_wallet(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<WalletView>>, ApiError> {
    ok(
        service::find_wallet(&state.db, &auth.workspace_id, &id).await,
        request_id,
    )
}

pub async fn create_wallet(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<CreateWalletBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<WalletView>>), ApiError> {
    created(
        service::create_wallet(
            &state.db,
            actor(&auth),
            NewWalletInput {
                name: &body.name,
                group_id: body.group_id.as_deref(),
                currency_code: body.currency_code.as_deref(),
                is_included_in_totals: body.is_included_in_totals,
                sort_order: body.sort_order,
            },
        )
        .await,
        request_id,
    )
}

pub async fn update_wallet(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateWalletBody>,
) -> std::result::Result<Json<Envelope<WalletView>>, ApiError> {
    ok(
        service::update_wallet(
            &state.db,
            actor(&auth),
            &id,
            WalletPatchInput {
                name: body.name.as_deref(),
                group_id: body.group_id.as_ref().map(|inner| inner.as_deref()),
                currency_code: body.currency_code.as_deref(),
                is_included_in_totals: body.is_included_in_totals,
                sort_order: body.sort_order,
            },
        )
        .await,
        request_id,
    )
}

pub async fn set_default_wallet(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<WalletView>>, ApiError> {
    ok(
        service::set_default_wallet(&state.db, actor(&auth), &id).await,
        request_id,
    )
}

pub async fn delete_wallet(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    no_content(
        service::delete_wallet(&state.db, actor(&auth), &id).await,
        request_id,
    )
}

// ------------------------------------------------------------- categories

pub async fn list_categories(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<CategoryQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<CategoryView>>>, ApiError> {
    let rows = service::list_categories(&state.db, &auth.workspace_id, query.r#type.as_deref())
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(
        rows.into_iter().map(Into::into).collect(),
        request_id.0,
    )))
}

pub async fn create_category(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<CreateCategoryBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<CategoryView>>), ApiError> {
    created(
        service::create_category(
            &state.db,
            actor(&auth),
            &body.name,
            &body.r#type,
            body.sort_order,
        )
        .await,
        request_id,
    )
}

pub async fn update_category(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateCategoryBody>,
) -> std::result::Result<Json<Envelope<CategoryView>>, ApiError> {
    ok(
        service::update_category(
            &state.db,
            actor(&auth),
            &id,
            body.name.as_deref(),
            body.r#type.as_deref(),
            body.sort_order,
        )
        .await,
        request_id,
    )
}

pub async fn delete_category(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    no_content(
        service::delete_category(&state.db, actor(&auth), &id).await,
        request_id,
    )
}

// ------------------------------------------------------------------ shared

fn actor(auth: &AuthWrite) -> Actor<'_> {
    Actor::web(&auth.workspace_id, &auth.user_id)
}

fn ok<R, V: From<R>>(
    result: Result<R>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<V>>, ApiError> {
    let id = request_id.0;
    match result {
        Ok(row) => Ok(Json(Envelope::data(V::from(row), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

fn created<R, V: From<R>>(
    result: Result<R>,
    request_id: RequestId,
) -> std::result::Result<(StatusCode, Json<Envelope<V>>), ApiError> {
    let id = request_id.0;
    match result {
        Ok(row) => Ok((StatusCode::CREATED, Json(Envelope::data(V::from(row), id)))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

fn no_content(
    result: Result<()>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let id = request_id.0;
    match result {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The three states of `group_id` have to survive JSON, not just the
    /// service signature: absent leaves the group, null detaches, a string
    /// moves it.
    #[test]
    fn should_tell_an_absent_group_id_apart_from_a_null_one() {
        let absent: UpdateWalletBody = serde_json::from_str(r#"{"name":"Cash"}"#).unwrap();
        assert_eq!(absent.group_id, None);

        let detach: UpdateWalletBody = serde_json::from_str(r#"{"group_id":null}"#).unwrap();
        assert_eq!(detach.group_id, Some(None));

        let moved: UpdateWalletBody = serde_json::from_str(r#"{"group_id":"grp_1"}"#).unwrap();
        assert_eq!(moved.group_id, Some(Some("grp_1".to_string())));
    }

    /// A balance in a body is ignored rather than honoured: the field does
    /// not exist on the request struct at all (TXN-3).
    #[test]
    fn should_not_accept_a_balance_in_a_wallet_body() {
        let body: UpdateWalletBody =
            serde_json::from_str(r#"{"name":"Cash","balance":"999.0000"}"#).unwrap();
        assert_eq!(body.name.as_deref(), Some("Cash"));
    }

    #[test]
    fn should_serialize_a_balance_as_a_string() {
        let view = WalletView {
            id: "w_1".into(),
            group_id: None,
            group_name: None,
            name: "Cash".into(),
            currency_code: "IDR".into(),
            balance: Decimal::new(1255000, 4),
            is_included_in_totals: true,
            is_default: true,
            sort_order: 0,
            created_at: "2026-11-02T00:00:00+00:00".into(),
            updated_at: "2026-11-02T00:00:00+00:00".into(),
        };

        let value = serde_json::to_value(&view).unwrap();
        assert_eq!(value["balance"], serde_json::json!("125.5000"));
    }
}
