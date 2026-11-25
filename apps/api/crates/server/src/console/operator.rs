//! The operator on a console request (CSL-2, D126).
//!
//! The token proves who the person is; whether they are an operator, and
//! what they may do, is read from the database on every request. Revoking a
//! role therefore takes effect on the next request, not when the token
//! expires.

use axum::{extract::FromRequestParts, http::request::Parts};
use oewang_domain::{AppError, ConsolePermission};

use crate::{
    auth::extractor::AuthUser,
    console::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Clone)]
pub struct Operator {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role_id: String,
    pub role_name: String,
    pub permissions: Vec<ConsolePermission>,
    // Read by `require`, which the console's data routes call (US-081 on).
    #[allow(dead_code)]
    request_id: String,
}

impl Operator {
    pub fn new(row: oewang_db::repositories::console::OperatorRow, request_id: String) -> Self {
        Self {
            // A key the CHECK allows but this build does not know is a
            // newer migration on an older binary; it grants nothing.
            permissions: row
                .permissions
                .iter()
                .filter_map(|key| ConsolePermission::parse(key))
                .collect(),
            user_id: row.user_id,
            email: row.email,
            name: row.name,
            role_id: row.role_id,
            role_name: row.role_name,
            request_id,
        }
    }

    #[allow(dead_code)]
    pub fn can(&self, permission: ConsolePermission) -> bool {
        self.permissions.contains(&permission)
    }

    /// The guard every console handler starts with.
    #[allow(dead_code)]
    pub fn require(&self, permission: ConsolePermission) -> Result<(), ApiError> {
        if self.can(permission) {
            Ok(())
        } else {
            Err(ApiError::new(
                AppError::ConsoleForbidden,
                self.request_id.clone(),
            ))
        }
    }
}

impl FromRequestParts<AppState> for Operator {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        let request_id = RequestId::from_parts(&parts.headers);

        service::operator(&state.db, &user.user_id)
            .await
            .map(|row| Operator::new(row, request_id.clone()))
            .map_err(|error| ApiError::new(error, request_id))
    }
}
