//! What a user changes about themselves, and the workspaces they open
//! (D94): their name, their photo, their password, a new workspace.
//!
//! The rules live here; the SQL lives in `accounts`. Each write is audited
//! in the workspace the user is acting from, because the audit log is
//! workspace-scoped and that is where a member looks for who changed what.

use base64::{engine::general_purpose::STANDARD, Engine};
use oewang_clients::storage::{Storage, StorageError};
use oewang_db::{
    repositories::{accounts, tokens},
    PgPool,
};
use oewang_domain::{
    auth::validate_password, files::sniff, money::validate_currency_code, AppError, Result, Role,
};

use crate::{
    audit::{log, Actor},
    auth::{
        password,
        service::{self, IssuedSession, SessionContext},
    },
};

/// The edge of a stored profile photo, in pixels.
pub const AVATAR_PX: u32 = 256;

/// The largest photo accepted before it is resized. The browser shrinks a
/// photo before sending it, so anything near this was sent around the app.
pub const MAX_AVATAR_BYTES: usize = 700 * 1024;

/// How many workspaces one person may own (WS-6). Not a plan limit, which
/// is a non-goal; a ceiling on how many a script can mint.
pub const MAX_OWNED_WORKSPACES: i64 = 10;

/// At most this many characters in a display name.
const MAX_NAME_CHARS: usize = 80;

// -------------------------------------------------------------- profile

/// Rename the user (AUTH-11). A blank name clears it.
pub async fn update_profile(
    pool: &PgPool,
    actor: Actor<'_>,
    name: Option<&str>,
) -> Result<accounts::UserRow> {
    let name = name.map(str::trim).filter(|value| !value.is_empty());
    if name.is_some_and(|value| value.chars().count() > MAX_NAME_CHARS) {
        return Err(AppError::validation([(
            "name",
            "A name can be at most 80 characters.",
        )]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let user = accounts::update_user_name(&mut *tx, actor.user_id, name)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;

    log(
        &mut tx,
        actor,
        "user.updated",
        "user",
        actor.user_id,
        None,
        Some(serde_json::json!({ "name": user.name })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(user)
}

/// Set the colours income and expense are drawn in, for this user only
/// (UI-12, D100). The whole pair every time; `None` restores the default.
pub async fn update_colors(
    pool: &PgPool,
    actor: Actor<'_>,
    income_color: Option<&str>,
    expense_color: Option<&str>,
) -> Result<accounts::UserRow> {
    let income = normalize_color("income_color", income_color)?;
    let expense = normalize_color("expense_color", expense_color)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    let user = accounts::update_user_colors(
        &mut *tx,
        actor.user_id,
        income.as_deref(),
        expense.as_deref(),
    )
    .await
    .map_err(internal)?
    .ok_or(AppError::Unauthenticated)?;

    log(
        &mut tx,
        actor,
        "user.colors_updated",
        "user",
        actor.user_id,
        None,
        Some(serde_json::json!({
            "income_color": user.income_color,
            "expense_color": user.expense_color
        })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(user)
}

/// `#RRGGBB` in any case, lowercased; blank means the default. Anything
/// else is refused: the value ends up in a style attribute (D100).
fn normalize_color(field: &'static str, value: Option<&str>) -> Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let valid = value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return Err(AppError::validation([(
            field,
            "Use a colour like #10bc99.",
        )]));
    }
    Ok(Some(value.to_ascii_lowercase()))
}

/// Change the password, knowing the current one (AUTH-12).
///
/// Every other session ends, as a reset ends them: a password worth changing
/// may be one somebody else knows. The caller gets a fresh session in the
/// same workspace, so changing it does not sign them out of the tab they
/// changed it in.
pub async fn change_password(
    pool: &PgPool,
    actor: Actor<'_>,
    current: &str,
    new: &str,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let credentials = accounts::find_credentials_by_id(pool, actor.user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;

    // A field error rather than INVALID_CREDENTIALS: that answer is a 401,
    // and a 401 signs the browser out (docs/security/auth.md).
    if !password::verify(current.to_string(), credentials.password_hash).await {
        return Err(AppError::validation([(
            "current_password",
            "That is not your current password.",
        )]));
    }
    validate_password(new)?;
    if current == new {
        return Err(AppError::validation([(
            "new_password",
            "Choose a password you are not already using.",
        )]));
    }

    let password_hash = password::hash(new.to_string()).await?;
    let role = service::current_role(pool, actor.workspace_id, actor.user_id).await?;

    let mut tx = pool.begin().await.map_err(internal)?;
    accounts::update_password(&mut *tx, actor.user_id, &password_hash)
        .await
        .map_err(internal)?;
    let revoked = tokens::revoke_all_for_user(&mut *tx, actor.user_id)
        .await
        .map_err(internal)?;
    crate::telegram::link::revoke_all_for_user(&mut *tx, actor.user_id).await?;

    log(
        &mut tx,
        actor,
        "user.password_changed",
        "user",
        actor.user_id,
        None,
        Some(serde_json::json!({ "sessions_ended": revoked })),
    )
    .await?;

    let issued =
        service::issue_in(&mut tx, actor.user_id, actor.workspace_id, role, &session).await?;
    tx.commit().await.map_err(internal)?;

    Ok(issued)
}

// ---------------------------------------------------------------- photo

/// Where a user's photo lives. Under the user, not a workspace: a person has
/// one face in every workspace they belong to.
fn avatar_key(user_id: &str) -> String {
    format!("usr/{user_id}/avatar")
}

/// Store a new photo (AUTH-13). The bytes are sniffed, decoded under the
/// same limits as a vault preview, and re-encoded as a small square JPEG,
/// so what is kept is never what was sent.
pub async fn set_avatar(
    pool: &PgPool,
    store: &impl Storage,
    actor: Actor<'_>,
    data: &str,
) -> Result<String> {
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|_| AppError::validation([("data", "The photo is not valid base64.")]))?;
    if bytes.len() > MAX_AVATAR_BYTES {
        return Err(AppError::FileTooLarge);
    }
    if !matches!(
        sniff(&bytes),
        Some("image/jpeg" | "image/png" | "image/webp")
    ) {
        return Err(AppError::UnsupportedFileType);
    }

    let photo = tokio::task::spawn_blocking(move || crate::images::square_jpeg(&bytes, AVATAR_PX))
        .await
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?
        .ok_or(AppError::UnsupportedFileType)?;

    store
        .put(&avatar_key(actor.user_id), &photo)
        .await
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))?;

    // A new version each time, so a browser holding the old one asks again.
    let version = cuid2::create_id();
    let mut tx = pool.begin().await.map_err(internal)?;
    accounts::set_profile_picture(&mut *tx, actor.user_id, Some(&version))
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "user.photo_changed",
        "user",
        actor.user_id,
        None,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)?;

    Ok(version)
}

/// The current photo's bytes, or `NotFound` when there is none.
pub async fn read_avatar(pool: &PgPool, store: &impl Storage, user_id: &str) -> Result<Vec<u8>> {
    let user = accounts::find_user_by_id(pool, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;
    if user.profile_picture.is_none() {
        return Err(AppError::NotFound);
    }

    store
        .get(&avatar_key(user_id))
        .await
        .map_err(|error| match error {
            StorageError::NotFound => AppError::NotFound,
            other => AppError::Internal(anyhow::anyhow!(other)),
        })
}

/// Remove the photo. The row is cleared in the transaction; the object goes
/// after the commit, as a deleted file's chunks do.
pub async fn remove_avatar(pool: &PgPool, store: &impl Storage, actor: Actor<'_>) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    accounts::set_profile_picture(&mut *tx, actor.user_id, None)
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "user.photo_removed",
        "user",
        actor.user_id,
        None,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)?;

    if let Err(error) = store.delete(&avatar_key(actor.user_id)).await {
        tracing::warn!(%error, "profile photo left behind after removal");
    }
    Ok(())
}

// ----------------------------------------------------------- workspaces

/// Open a new workspace owned by the caller (WS-6), seeded as registration
/// seeds one (WS-5). The caller switches into it separately, so creating
/// and switching stay one rule each.
pub async fn create_workspace(
    pool: &PgPool,
    user_id: &str,
    name: &str,
    currency_code: &str,
) -> Result<accounts::WorkspaceRow> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation([("name", "Required.")]));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation([(
            "name",
            "A name can be at most 80 characters.",
        )]));
    }
    let currency = validate_currency_code("currency_code", currency_code)?;

    if accounts::count_owned_workspaces(pool, user_id)
        .await
        .map_err(internal)?
        >= MAX_OWNED_WORKSPACES
    {
        return Err(AppError::validation([(
            "name",
            "You own the most workspaces one account may have.",
        )]));
    }

    let workspace_id = cuid2::create_id();
    let mut tx = pool.begin().await.map_err(internal)?;
    let slug = service::unique_slug(&mut tx, name).await?;

    accounts::insert_workspace(&mut *tx, &workspace_id, name, &slug, &currency)
        .await
        .map_err(internal)?;
    accounts::insert_membership(
        &mut *tx,
        &cuid2::create_id(),
        &workspace_id,
        user_id,
        Role::Owner.as_str(),
    )
    .await
    .map_err(internal)?;
    oewang_db::seed::seed_workspace(&mut tx, &workspace_id, &currency)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        Actor::web(&workspace_id, user_id),
        "workspace.created",
        "workspace",
        &workspace_id,
        None,
        Some(serde_json::json!({ "name": name, "currency_code": currency })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    accounts::find_workspace(pool, &workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use oewang_domain::Secret;
    use sqlx::PgPool;

    use super::*;
    use crate::vault::tests::MemoryStore;

    const WORKSPACE: &str = "ws_acct";
    const USER: &str = "usr_acct";

    async fn fixture(pool: &PgPool, password_plain: &str) {
        let hash = password::hash(password_plain.to_string()).await.unwrap();
        sqlx::query(
            "INSERT INTO users (id, email, password_hash) VALUES ($1, 'me@example.com', $2)",
        )
        .bind(USER)
        .bind(hash)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Home', 'home', 'IDR')",
        )
        .bind(WORKSPACE)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ('m_acct', $1, $2, 'owner')",
        )
        .bind(WORKSPACE)
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    }

    fn actor() -> Actor<'static> {
        Actor::web(WORKSPACE, USER)
    }

    fn png() -> String {
        let image = image::RgbImage::from_pixel(600, 400, image::Rgb([30, 30, 30]));
        let mut out = std::io::Cursor::new(Vec::new());
        image.write_to(&mut out, image::ImageFormat::Png).unwrap();
        STANDARD.encode(out.into_inner())
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_create_a_seeded_workspace_owned_by_the_caller(pool: PgPool) {
        fixture(&pool, "correct horse battery").await;

        let created = create_workspace(&pool, USER, "  Side project ", "usd")
            .await
            .unwrap();
        assert_eq!(created.name, "Side project");
        assert_eq!(created.currency_code, "USD");

        let role: String = sqlx::query_scalar(
            "SELECT role FROM user_workspaces WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(&created.id)
        .bind(USER)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(role, "owner");

        let categories: i64 =
            sqlx::query_scalar("SELECT count(*) FROM categories WHERE workspace_id = $1")
                .bind(&created.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(categories > 0, "seeded as registration seeds one");

        assert!(matches!(
            create_workspace(&pool, USER, "   ", "IDR").await,
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create_workspace(&pool, USER, "Bad money", "ZZZZ").await,
            Err(AppError::Validation(_))
        ));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_stop_at_the_owned_workspace_ceiling(pool: PgPool) {
        fixture(&pool, "correct horse battery").await;
        for index in 1..MAX_OWNED_WORKSPACES {
            create_workspace(&pool, USER, &format!("W{index}"), "IDR")
                .await
                .unwrap();
        }

        assert!(matches!(
            create_workspace(&pool, USER, "One too many", "IDR").await,
            Err(AppError::Validation(_))
        ));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_rename_and_audit(pool: PgPool) {
        fixture(&pool, "correct horse battery").await;

        let user = update_profile(&pool, actor(), Some("  Azlan "))
            .await
            .unwrap();
        assert_eq!(user.name.as_deref(), Some("Azlan"));

        let cleared = update_profile(&pool, actor(), Some("   ")).await.unwrap();
        assert_eq!(cleared.name, None);

        let audited: i64 =
            sqlx::query_scalar("SELECT count(*) FROM audit_logs WHERE action = 'user.updated'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(audited, 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_change_the_password_only_with_the_current_one(pool: PgPool) {
        fixture(&pool, "correct horse battery").await;
        let secret = Secret::new("a-test-secret-that-is-long-enough-for-hs256");
        let session = || SessionContext {
            jwt_secret: &secret,
            access_ttl: Duration::from_secs(900),
            refresh_ttl: Duration::from_secs(3600),
            user_agent: None,
            ip: None,
        };

        let wrong = change_password(&pool, actor(), "nope", "a new long password", session()).await;
        assert!(
            matches!(wrong, Err(AppError::Validation(_))),
            "a field error, never a 401 that would sign the browser out"
        );

        let issued = change_password(
            &pool,
            actor(),
            "correct horse battery",
            "a new long password",
            session(),
        )
        .await
        .unwrap();
        assert_eq!(issued.workspace_id, WORKSPACE);

        let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
            .bind(USER)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(password::verify("a new long password".into(), hash).await);

        let live: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL",
        )
        .bind(USER)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(live, 1, "only the session just issued");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_store_a_photo_as_a_small_square_and_remove_it(pool: PgPool) {
        fixture(&pool, "correct horse battery").await;
        let store = MemoryStore::default();

        let version = set_avatar(&pool, &store, actor(), &png()).await.unwrap();
        assert!(!version.is_empty());

        let photo = read_avatar(&pool, &store, USER).await.unwrap();
        let decoded = image::load_from_memory(&photo).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (AVATAR_PX, AVATAR_PX));

        assert!(matches!(
            set_avatar(
                &pool,
                &store,
                actor(),
                &STANDARD.encode(b"%PDF-1.7 not a photo")
            )
            .await,
            Err(AppError::UnsupportedFileType)
        ));

        remove_avatar(&pool, &store, actor()).await.unwrap();
        assert!(matches!(
            read_avatar(&pool, &store, USER).await,
            Err(AppError::NotFound)
        ));
    }
}

#[cfg(test)]
mod color_tests {
    use super::normalize_color;

    #[test]
    fn should_accept_a_hex_colour_and_lowercase_it() {
        assert_eq!(
            normalize_color("income_color", Some(" #10BC99 ")).unwrap(),
            Some("#10bc99".to_string())
        );
    }

    #[test]
    fn should_treat_blank_as_the_default() {
        assert_eq!(normalize_color("income_color", Some("  ")).unwrap(), None);
        assert_eq!(normalize_color("income_color", None).unwrap(), None);
    }

    #[test]
    fn should_refuse_anything_that_is_not_six_hex_digits() {
        for bad in [
            "10bc99",
            "#10bc9",
            "#10bc99;",
            "red",
            "#gggggg",
            "#10bc99\"};color:red",
        ] {
            assert!(normalize_color("income_color", Some(bad)).is_err(), "{bad}");
        }
    }
}
