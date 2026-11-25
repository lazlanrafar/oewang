//! Console roles and the operator lookup (CSL-2, D125, D126).

use chrono::Datelike;
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

// ---------------------------------------------------------------- actions

async fn operator_audit(pool: &PgPool) -> Vec<(String, String)> {
    sqlx::query_as("SELECT action, entity_id FROM operator_audit ORDER BY created_at, action")
        .fetch_all(pool)
        .await
        .unwrap()
}

/// CSL-5, CSL-14
#[sqlx::test(migrations = "../../migrations")]
async fn should_suspend_and_unsuspend_a_workspace_once_each(pool: PgPool) {
    user(&pool, Some("owner")).await;
    customers(&pool).await;

    let row = service::set_suspended(&pool, USER, WORKSPACE, true)
        .await
        .unwrap();
    assert!(row.suspended_at.is_some());
    // Asking again changes nothing and is not audited twice.
    service::set_suspended(&pool, USER, WORKSPACE, true)
        .await
        .unwrap();
    let row = service::set_suspended(&pool, USER, WORKSPACE, false)
        .await
        .unwrap();
    assert!(row.suspended_at.is_none());

    assert_eq!(
        operator_audit(&pool).await,
        [
            ("workspace.suspended".to_string(), WORKSPACE.to_string()),
            ("workspace.unsuspended".to_string(), WORKSPACE.to_string()),
        ]
    );

    // A deleted workspace is restored first, not suspended.
    let error = service::set_suspended(&pool, USER, GONE, true)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
    let error = service::set_suspended(&pool, USER, "ws_nope", true)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::NotFound), "{error:?}");
}

/// CSL-6, CSL-14
#[sqlx::test(migrations = "../../migrations")]
async fn should_restore_a_deleted_workspace(pool: PgPool) {
    user(&pool, Some("owner")).await;
    customers(&pool).await;

    let row = service::restore(&pool, USER, GONE).await.unwrap();
    assert!(row.deleted_at.is_none());
    service::restore(&pool, USER, GONE).await.unwrap();
    assert_eq!(
        operator_audit(&pool).await,
        [("workspace.restored".to_string(), GONE.to_string())]
    );
}

/// CSL-7, CSL-14
#[sqlx::test(migrations = "../../migrations")]
async fn should_disable_a_user_and_end_their_sessions(pool: PgPool) {
    user(&pool, Some("owner")).await;
    customers(&pool).await;
    sqlx::query(
        "INSERT INTO refresh_tokens (id, user_id, workspace_id, token_hash, family_id, expires_at)
         VALUES ('rt_1', $1, $2, 'hash', 'fam', now() + interval '1 day')",
    )
    .bind(OWNER)
    .bind(WORKSPACE)
    .execute(&pool)
    .await
    .unwrap();

    let row = service::set_disabled(&pool, USER, OWNER, true)
        .await
        .unwrap();
    assert!(row.disabled_at.is_some());
    let live: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL",
    )
    .bind(OWNER)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(live, 0);

    let row = service::set_disabled(&pool, USER, OWNER, false)
        .await
        .unwrap();
    assert!(row.disabled_at.is_none());
    assert_eq!(
        operator_audit(&pool).await,
        [
            ("user.disabled".to_string(), OWNER.to_string()),
            ("user.enabled".to_string(), OWNER.to_string()),
        ]
    );
}

/// CSL-7: an operator, the caller included, is never disabled.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_disable_an_operator(pool: PgPool) {
    user(&pool, Some("owner")).await;
    customers(&pool).await;
    sqlx::query("UPDATE users SET console_role_id = 'viewer' WHERE id = $1")
        .bind(OWNER)
        .execute(&pool)
        .await
        .unwrap();

    for target in [USER, OWNER] {
        let error = service::set_disabled(&pool, USER, target, true)
            .await
            .unwrap_err();
        assert!(
            matches!(error, AppError::Validation(_)),
            "{target}: {error:?}"
        );
    }
    assert!(operator_audit(&pool).await.is_empty());
}

/// CSL-5, CSL-7, D127: the shared check every way in goes through.
#[sqlx::test(migrations = "../../migrations")]
async fn should_shut_a_suspended_workspace_and_a_disabled_user_out(pool: PgPool) {
    use crate::auth::service::{check_access, current_role};
    user(&pool, Some("owner")).await;
    customers(&pool).await;
    assert!(current_role(&pool, WORKSPACE, OWNER).await.is_ok());

    service::set_suspended(&pool, USER, WORKSPACE, true)
        .await
        .unwrap();
    let error = current_role(&pool, WORKSPACE, OWNER).await.unwrap_err();
    assert!(matches!(error, AppError::WorkspaceSuspended), "{error:?}");
    // Outside the workspace the person is still welcome: listing and
    // switching to another one go through.
    assert!(check_access(&pool, OWNER, None).await.is_ok());
    let listed = oewang_db::repositories::accounts::list_workspaces_for_user(&pool, OWNER)
        .await
        .unwrap();
    assert!(listed.iter().any(|w| w.id == WORKSPACE && w.suspended));

    service::set_suspended(&pool, USER, WORKSPACE, false)
        .await
        .unwrap();
    service::set_disabled(&pool, USER, OWNER, true)
        .await
        .unwrap();
    let error = check_access(&pool, OWNER, None).await.unwrap_err();
    assert!(matches!(error, AppError::UserDisabled), "{error:?}");
    let error = current_role(&pool, WORKSPACE, OWNER).await.unwrap_err();
    assert!(matches!(error, AppError::UserDisabled), "{error:?}");
}

// --------------------------------------------- feedback, overview, usage

async fn some_feedback(pool: &PgPool) -> String {
    let row = crate::feedback::service::send(
        pool,
        crate::audit::Actor::web(WORKSPACE, OWNER),
        "bug",
        "The chart is empty.",
    )
    .await
    .unwrap();
    row.id
}

/// CSL-8, CSL-14
#[sqlx::test(migrations = "../../migrations")]
async fn should_list_and_answer_feedback(pool: PgPool) {
    user(&pool, Some("support")).await;
    customers(&pool).await;
    let id = some_feedback(&pool).await;
    let page = oewang_domain::Page::new(None, None);

    let open = oewang_db::repositories::console::FeedbackFilter {
        search: Some("chart"),
        status: Some("open"),
        kind: Some("bug"),
    };
    let (rows, total) = service::feedback(&pool, &open, page).await.unwrap();
    assert_eq!(total, 1);
    assert_eq!(rows[0].user_email, "rina@example.com");
    assert_eq!(rows[0].workspace_name, "Rina Home");

    let row = service::update_feedback(
        &pool,
        USER,
        &id,
        Some("done"),
        Some(Some("  Fixed in 1.2  ")),
    )
    .await
    .unwrap();
    assert_eq!(row.status, "done");
    assert_eq!(row.operator_note.as_deref(), Some("Fixed in 1.2"));
    assert!(row.resolved_at.is_some());

    // The note alone, left as it is: no change, no second audit row.
    service::update_feedback(&pool, USER, &id, None, None)
        .await
        .unwrap();
    let row = service::update_feedback(&pool, USER, &id, Some("open"), Some(Some("")))
        .await
        .unwrap();
    assert_eq!(
        (row.status.as_str(), row.operator_note, row.resolved_at),
        ("open", None, None)
    );

    let actions: Vec<String> = operator_audit(&pool)
        .await
        .into_iter()
        .map(|(a, _)| a)
        .collect();
    assert_eq!(actions, ["feedback.updated", "feedback.updated"]);

    let error = service::update_feedback(&pool, USER, &id, Some("closed"), None)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

/// CSL-9, CSL-10: the front page and the usage page add up, without money.
#[sqlx::test(migrations = "../../migrations")]
async fn should_count_the_overview_usage_and_health(pool: PgPool) {
    customers(&pool).await;
    some_feedback(&pool).await;
    for (feature, model, input) in [
        ("chat", "m-1", 100),
        ("chat", "m-2", 50),
        ("receipt", "m-1", 7),
    ] {
        sqlx::query(
            "INSERT INTO ai_usage (id, workspace_id, user_id, feature, model, input_tokens, output_tokens)
             VALUES ($1, $2, $3, $4, $5, $6, 1)",
        )
        .bind(format!("use_{feature}_{model}"))
        .bind(WORKSPACE)
        .bind(OWNER)
        .bind(feature)
        .bind(model)
        .bind(input)
        .execute(&pool)
        .await
        .unwrap();
    }

    let overview = service::overview(&pool).await.unwrap();
    assert_eq!(overview.users.total, 1);
    assert_eq!(
        (
            overview.workspaces.total,
            overview.workspaces.active,
            overview.workspaces.deleted
        ),
        (2, 1, 1)
    );
    assert_eq!(overview.feedback_open, 1);
    assert_eq!(overview.tokens_month.input, 157);
    assert_eq!(overview.signups_by_week.len(), 12);
    assert_eq!(
        overview
            .signups_by_week
            .iter()
            .map(|w| w.count)
            .sum::<i64>(),
        1
    );

    let month = chrono::Utc::now().date_naive().with_day(1).unwrap();
    let report = service::usage(&pool, month).await.unwrap();
    assert_eq!((report.totals.input, report.totals.calls), (157, 3));
    assert_eq!(
        report.by_workspace[0].workspace_name.as_deref(),
        Some("Rina Home")
    );
    assert_eq!(report.by_model[0].model.as_deref(), Some("m-1"));
    assert_eq!(report.by_model[0].input, 107);
    let last_month = month.checked_sub_months(chrono::Months::new(1)).unwrap();
    assert_eq!(
        service::usage(&pool, last_month)
            .await
            .unwrap()
            .totals
            .calls,
        0
    );

    let health = service::health(&pool).await.unwrap();
    assert_eq!(health.ai_calls_by_day.len(), 14);
    assert_eq!(health.ai_calls_by_day.last().unwrap().calls, 3);
    assert_eq!(health.receipt_jobs.failed_7d, 0);
}

// ------------------------------------------------------ roles, operators

async fn person(pool: &PgPool, id: &str, role: Option<&str>) {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, console_role_id)
         VALUES ($1, $1 || '@example.com', 'x', $2)",
    )
    .bind(id)
    .bind(role)
    .execute(pool)
    .await
    .unwrap();
}

async fn as_operator(pool: &PgPool, id: &str) -> Operator {
    Operator::new(service::operator(pool, id).await.unwrap(), "req".into())
}

fn permission_keys(permissions: &[ConsolePermission]) -> Vec<String> {
    permissions.iter().map(|p| p.key().to_string()).collect()
}

/// CSL-12: roles are made, edited and deleted within what the editor holds.
#[sqlx::test(migrations = "../../migrations")]
async fn should_manage_roles_within_what_the_operator_holds(pool: PgPool) {
    use ConsolePermission::*;
    person(&pool, "usr_owner", Some("owner")).await;
    person(&pool, "usr_support", Some("support")).await;
    let owner = as_operator(&pool, "usr_owner").await;
    let support = as_operator(&pool, "usr_support").await;

    let role = service::create_role(
        &pool,
        &owner,
        " Analyst ",
        None,
        &permission_keys(&[Read, AuditRead]),
    )
    .await
    .unwrap();
    assert_eq!(role.name, "Analyst");
    assert_eq!(role.permissions, ["console.audit.read", "console.read"]);

    // Support does not hold suspend, so it cannot put it in a role.
    let error = service::create_role(
        &pool,
        &support,
        "Wide",
        None,
        &permission_keys(&[WorkspacesSuspend]),
    )
    .await
    .unwrap_err();
    assert!(matches!(error, AppError::ConsoleForbidden), "{error:?}");
    let error = service::create_role(&pool, &owner, "analyst", None, &[])
        .await
        .unwrap_err();
    assert!(
        matches!(error, AppError::Validation(_)),
        "a duplicate name: {error:?}"
    );

    let edited = service::update_role(
        &pool,
        &owner,
        &role.id,
        None,
        None,
        Some(&permission_keys(&[Read])),
    )
    .await
    .unwrap();
    assert_eq!(edited.permissions, ["console.read"]);

    for (who, id) in [(&owner, "owner"), (&support, "support")] {
        let error = service::update_role(&pool, who, id, Some("Renamed"), None, None)
            .await
            .unwrap_err();
        assert!(matches!(error, AppError::Validation(_)), "{id}: {error:?}");
    }

    let error = service::delete_role(&pool, &owner, "support")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::ConsoleRoleInUse), "{error:?}");
    service::delete_role(&pool, &owner, &role.id).await.unwrap();
    assert!(service::roles(&pool)
        .await
        .unwrap()
        .iter()
        .all(|r| r.id != role.id));

    let actions: Vec<String> = operator_audit(&pool)
        .await
        .into_iter()
        .map(|(a, _)| a)
        .collect();
    assert_eq!(actions, ["role.created", "role.updated", "role.deleted"]);
}

/// CSL-11: grant, change and revoke, never one's own, never above one's
/// own, never the last owner.
#[sqlx::test(migrations = "../../migrations")]
async fn should_grant_and_revoke_operators_with_the_guards(pool: PgPool) {
    use ConsolePermission::*;
    person(&pool, "usr_owner", Some("owner")).await;
    person(&pool, "usr_lead", None).await;
    person(&pool, "usr_staff", None).await;
    let owner = as_operator(&pool, "usr_owner").await;

    // Nobody changes their own role.
    let error = service::set_operator_role(&pool, &owner, "usr_owner", None)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");

    // A lead with every permission but not the owner role.
    let all = service::create_role(
        &pool,
        &owner,
        "Lead",
        None,
        &permission_keys(&ConsolePermission::ALL),
    )
    .await
    .unwrap();
    let row = service::set_operator_role(&pool, &owner, "usr_lead", Some(&all.id))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.role_name, "Lead");
    let lead = as_operator(&pool, "usr_lead").await;

    // The lead cannot take the only owner's role away.
    let error = service::set_operator_role(&pool, &lead, "usr_owner", None)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::LastOwner), "{error:?}");

    // A support operator cannot grant a role wider than support.
    service::set_operator_role(&pool, &owner, "usr_staff", Some("support"))
        .await
        .unwrap();
    let support_lead = {
        sqlx::query("UPDATE users SET console_role_id = 'support' WHERE id = 'usr_lead'")
            .execute(&pool)
            .await
            .unwrap();
        as_operator(&pool, "usr_lead").await
    };
    assert!(!support_lead.can(OperatorsManage));
    let error = service::set_operator_role(&pool, &support_lead, "usr_staff", Some("owner"))
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::ConsoleForbidden), "{error:?}");

    service::set_operator_role(&pool, &owner, "usr_staff", None)
        .await
        .unwrap();
    let operators = service::operators(&pool).await.unwrap();
    assert!(operators.iter().all(|row| row.user_id != "usr_staff"));

    let actions: Vec<String> = operator_audit(&pool)
        .await
        .into_iter()
        .map(|(a, _)| a)
        .collect();
    assert!(actions.contains(&"operator.granted".to_string()));
    assert!(actions.contains(&"operator.revoked".to_string()));
    let (rows, total) = service::operator_audit(&pool, oewang_domain::Page::new(None, None))
        .await
        .unwrap();
    assert_eq!(rows.len() as i64, total);
    assert_eq!(rows[0].operator_email, "usr_owner@example.com");
}
