//! Console roles and the operator lookup (CSL-2, D125, D126).

use oewang_domain::{AppError, ConsolePermission};
use sqlx::PgPool;

use crate::console::{operator::Operator, service};

const USER: &str = "usr_console";

async fn user(pool: &PgPool, role: Option<&str>) {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, console_role_id)
         VALUES ($1, 'op@example.com', 'x', $2)",
    )
    .bind(USER)
    .bind(role)
    .execute(pool)
    .await
    .unwrap();
}

async fn permissions(pool: &PgPool) -> Vec<ConsolePermission> {
    let row = service::operator(pool, USER).await.unwrap();
    Operator::new(row, "req".into()).permissions
}

/// CSL-2: the seeded roles hold the agreed matrix.
#[sqlx::test(migrations = "../../migrations")]
async fn should_seed_owner_support_and_viewer(pool: PgPool) {
    use ConsolePermission::*;
    user(&pool, Some("owner")).await;
    let mut owner = permissions(&pool).await;
    owner.sort();
    assert_eq!(owner, ConsolePermission::ALL.to_vec());

    for (role, expected) in [
        ("support", vec![Read, FeedbackWrite, UsersDisable]),
        ("viewer", vec![Read]),
    ] {
        sqlx::query("UPDATE users SET console_role_id = $1 WHERE id = $2")
            .bind(role)
            .bind(USER)
            .execute(&pool)
            .await
            .unwrap();
        let mut held = permissions(&pool).await;
        held.sort();
        assert_eq!(held, expected, "{role}");
    }
}

/// CSL-2: no role, or a deleted one, is not an operator.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_user_without_a_live_role(pool: PgPool) {
    user(&pool, None).await;
    let error = service::operator(&pool, USER).await.unwrap_err();
    assert!(matches!(error, AppError::ConsoleForbidden), "{error:?}");

    sqlx::query("UPDATE users SET console_role_id = 'viewer' WHERE id = $1")
        .bind(USER)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE console_roles SET deleted_at = now() WHERE id = 'viewer'")
        .execute(&pool)
        .await
        .unwrap();
    let error = service::operator(&pool, USER).await.unwrap_err();
    assert!(matches!(error, AppError::ConsoleForbidden), "{error:?}");
}

/// D125: the database CHECK and the domain enum list the same keys.
#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_the_permission_check_and_the_enum_in_step(pool: PgPool) {
    sqlx::query("INSERT INTO console_roles (id, name) VALUES ('probe', 'Probe')")
        .execute(&pool)
        .await
        .unwrap();
    for permission in ConsolePermission::ALL {
        sqlx::query(
            "INSERT INTO console_role_permissions (role_id, permission) VALUES ('probe', $1)",
        )
        .bind(permission.key())
        .execute(&pool)
        .await
        .unwrap_or_else(|error| panic!("{}: {error}", permission.key()));
    }
    let unknown = sqlx::query(
        "INSERT INTO console_role_permissions (role_id, permission) VALUES ('probe', 'console.everything')",
    )
    .execute(&pool)
    .await;
    assert!(unknown.is_err());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_permission_the_role_lacks(pool: PgPool) {
    user(&pool, Some("viewer")).await;
    let operator = Operator::new(service::operator(&pool, USER).await.unwrap(), "req".into());

    assert!(operator.require(ConsolePermission::Read).is_ok());
    let error = operator
        .require(ConsolePermission::WorkspacesSuspend)
        .unwrap_err();
    assert_eq!(error.error.code(), "CONSOLE_FORBIDDEN");
}
