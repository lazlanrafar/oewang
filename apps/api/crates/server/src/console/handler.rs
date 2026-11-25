//! `/v1/console/*` handlers (CSL).

use axum::Json;
use oewang_domain::{ConsolePermission, Envelope};
use serde::Serialize;

use crate::{
    console::operator::Operator,
    response::{ApiError, RequestId},
};

#[derive(Debug, Serialize)]
pub struct MeView {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: RoleView,
    pub permissions: Vec<ConsolePermission>,
}

#[derive(Debug, Serialize)]
pub struct RoleView {
    pub id: String,
    pub name: String,
}

/// `GET /v1/console/me` (CSL-2). Any operator, whatever their permissions:
/// the app builds its menu from the answer.
pub async fn me(
    operator: Operator,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<MeView>>, ApiError> {
    Ok(Json(Envelope::data(
        MeView {
            id: operator.user_id,
            email: operator.email,
            name: operator.name,
            role: RoleView {
                id: operator.role_id,
                name: operator.role_name,
            },
            permissions: operator.permissions,
        },
        request_id.0,
    )))
}
