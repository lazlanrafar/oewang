//! Console roles and the operator lookup (CSL-2, D125, D126).

use oewang_domain::{AppError, ConsolePermission};
use sqlx::PgPool;

use oewang_db::repositories::console::{UserSort, WorkspaceSort, WorkspaceStatus};

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

// ------------------------------------------------------- users, workspaces

const OWNER: &str = "usr_ws_owner";
const WORKSPACE: &str = "ws_console";
const GONE: &str = "ws_console_gone";

async fn customers(pool: &PgPool) {
    sqlx::query(
        "INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, 'rina@example.com', 'Rina', 'x')",
    )
    .bind(OWNER)
    .execute(pool)
    .await
    .unwrap();
    for (id, name, deleted) in [(WORKSPACE, "Rina Home", false), (GONE, "Old Shop", true)] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code, deleted_at)
             VALUES ($1, $2, $1, 'IDR', CASE WHEN $3 THEN now() END)",
        )
        .bind(id)
        .bind(name)
        .bind(deleted)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
             VALUES ($1 || '_m', $1, $2, 'owner')",
        )
        .bind(id)
        .bind(OWNER)
        .execute(pool)
        .await
        .unwrap();
    }
    // Money the console must never show (CSL-13).
    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code, balance)
         VALUES ('wal_secret', $1, 'SECRET-WALLET', 'IDR', 98765.43)",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

/// CSL-3
#[sqlx::test(migrations = "../../migrations")]
async fn should_list_and_search_users_with_their_workspaces(pool: PgPool) {
    user(&pool, Some("viewer")).await;
    customers(&pool).await;

    let page = oewang_domain::Page::new(None, None);
    let (rows, total) = service::users(&pool, Some("RINA"), UserSort::Email, false, page)
        .await
        .unwrap();
    assert_eq!(total, 1);
    assert_eq!(rows[0].email, "rina@example.com");
    // The deleted workspace is not counted among the live ones.
    assert_eq!(rows[0].workspaces, 1);
    assert_eq!(rows[0].console_role, None);

    let (all, total) = service::users(&pool, None, UserSort::CreatedAt, true, page)
        .await
        .unwrap();
    assert_eq!((all.len(), total), (2, 2));
    let operator = all.iter().find(|row| row.id == USER).unwrap();
    assert_eq!(operator.console_role.as_deref(), Some("Viewer"));

    let detail = service::user(&pool, OWNER).await.unwrap();
    assert_eq!(detail.memberships.len(), 2);
    let gone = detail
        .memberships
        .iter()
        .find(|m| m.workspace_id == GONE)
        .unwrap();
    assert!(gone.workspace_deleted_at.is_some());

    let missing = service::user(&pool, "usr_nobody").await.unwrap_err();
    assert!(matches!(missing, AppError::NotFound), "{missing:?}");
}

/// CSL-4
#[sqlx::test(migrations = "../../migrations")]
async fn should_list_workspaces_by_status_with_their_counts(pool: PgPool) {
    customers(&pool).await;
    let page = oewang_domain::Page::new(None, None);

    for (status, expected) in [
        (None, vec![WORKSPACE, GONE]),
        (Some(WorkspaceStatus::Active), vec![WORKSPACE]),
        (Some(WorkspaceStatus::Deleted), vec![GONE]),
    ] {
        let (rows, total) =
            service::workspaces(&pool, None, status, WorkspaceSort::Name, true, page)
                .await
                .unwrap();
        let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, expected, "{status:?}");
        assert_eq!(total as usize, expected.len());
    }

    let detail = service::workspace(&pool, WORKSPACE).await.unwrap();
    assert_eq!(
        detail.workspace.owner_email.as_deref(),
        Some("rina@example.com")
    );
    assert_eq!(detail.workspace.members, 1);
    assert_eq!(detail.counts.wallets, 1);
    assert_eq!(detail.counts.transactions, 0);
    assert_eq!(detail.member_list[0].role, "owner");
}

/// Every key anywhere in a JSON value.
fn keys(value: &serde_json::Value, into: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, inner) in map {
                into.push(key.clone());
                keys(inner, into);
            }
        }
        serde_json::Value::Array(items) => items.iter().for_each(|item| keys(item, into)),
        _ => {}
    }
}

/// CSL-13: nothing the console answers carries a user's money or the text
/// of their ledger, by key or by value.
#[sqlx::test(migrations = "../../migrations")]
async fn should_never_answer_with_a_users_money_or_ledger_text(pool: PgPool) {
    customers(&pool).await;
    let page = oewang_domain::Page::new(None, None);

    let answers = [
        serde_json::to_value(
            service::users(&pool, None, UserSort::CreatedAt, true, page)
                .await
                .unwrap()
                .0,
        )
        .unwrap(),
        serde_json::to_value(service::user(&pool, OWNER).await.unwrap()).unwrap(),
        serde_json::to_value(
            service::workspaces(&pool, None, None, WorkspaceSort::CreatedAt, true, page)
                .await
                .unwrap()
                .0,
        )
        .unwrap(),
        serde_json::to_value(service::workspace(&pool, WORKSPACE).await.unwrap()).unwrap(),
    ];

    const FORBIDDEN: [&str; 9] = [
        "amount",
        "balance",
        "base_amount",
        "note",
        "notes",
        "description",
        "transaction_name",
        "wallet_name",
        "category_name",
    ];
    for answer in &answers {
        let mut found = Vec::new();
        keys(answer, &mut found);
        for key in &found {
            assert!(
                !FORBIDDEN.contains(&key.as_str()),
                "console answered with `{key}`"
            );
        }
        let text = answer.to_string();
        assert!(!text.contains("SECRET-WALLET"), "a wallet name leaked");
        assert!(!text.contains("98765"), "a balance leaked");
    }
}
