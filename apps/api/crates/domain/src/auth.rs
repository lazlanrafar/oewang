//! Roles and what each one may do.
//!
//! The matrix is docs/security/auth.md#permission-matrix. This module is the
//! executable copy, and it lives in `domain` so the rules can be tested
//! without a database or a server.

use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    /// Read everything, write nothing.
    Member,
    /// Full read and write, no workspace deletion.
    Admin,
    /// Everything, including deleting the workspace.
    Owner,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Member => "member",
            Role::Admin => "admin",
            Role::Owner => "owner",
        }
    }

    /// Can create, update and delete ledger data: transactions, wallets,
    /// categories, files. The line this product actually cares about.
    pub fn can_write(&self) -> bool {
        matches!(self, Role::Admin | Role::Owner)
    }

    /// Can invite, remove and change a member's role.
    pub fn can_manage_members(&self) -> bool {
        matches!(self, Role::Admin | Role::Owner)
    }

    pub fn can_update_workspace(&self) -> bool {
        matches!(self, Role::Admin | Role::Owner)
    }

    /// Only the owner can delete the workspace. An admin who could would make
    /// the owner role meaningless.
    pub fn can_delete_workspace(&self) -> bool {
        matches!(self, Role::Owner)
    }

    /// Can grant this role to someone else. Nobody may grant a role above
    /// their own, which is what stops an admin minting an owner.
    pub fn can_grant(&self, target: Role) -> bool {
        match self {
            Role::Owner => true,
            Role::Admin => target != Role::Owner,
            Role::Member => false,
        }
    }
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, thiserror::Error)]
#[error("unknown role: {0}")]
pub struct UnknownRole(String);

impl FromStr for Role {
    type Err = UnknownRole;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "member" => Ok(Role::Member),
            "admin" => Ok(Role::Admin),
            "owner" => Ok(Role::Owner),
            other => Err(UnknownRole(other.to_string())),
        }
    }
}

/// Minimum password length.
///
/// Length only. No composition rules, which push people toward
/// `Password1!` and buy nothing, and no forced rotation.
pub const MIN_PASSWORD_LENGTH: usize = 10;

pub fn validate_password(password: &str) -> Result<(), crate::AppError> {
    if password.chars().count() < MIN_PASSWORD_LENGTH {
        return Err(crate::AppError::validation([(
            "password",
            "Must be at least 10 characters.",
        )]));
    }
    Ok(())
}

/// Normalize an email for storage and lookup.
///
/// Lowercased and trimmed, because a user who signs up as `Azlan@` and logs
/// in as `azlan@` means the same account. The database index is on
/// `lower(email)` to match.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

pub fn validate_email(email: &str) -> Result<(), crate::AppError> {
    let value = email.trim();
    // Deliberately permissive. The only reliable proof an address exists is
    // sending to it, and over-strict patterns reject valid addresses.
    let valid = value.len() >= 3
        && value.len() <= 254
        && !value.starts_with('@')
        && !value.ends_with('@')
        && value.matches('@').count() == 1
        && value.split('@').nth(1).is_some_and(|d| d.contains('.'));

    if valid {
        Ok(())
    } else {
        Err(crate::AppError::validation([(
            "email",
            "Enter a valid email address.",
        )]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_let_only_admin_and_owner_write() {
        assert!(!Role::Member.can_write());
        assert!(Role::Admin.can_write());
        assert!(Role::Owner.can_write());
    }

    #[test]
    fn should_let_only_the_owner_delete_the_workspace() {
        assert!(!Role::Member.can_delete_workspace());
        assert!(!Role::Admin.can_delete_workspace());
        assert!(Role::Owner.can_delete_workspace());
    }

    #[test]
    fn should_stop_an_admin_granting_owner() {
        assert!(Role::Admin.can_grant(Role::Member));
        assert!(Role::Admin.can_grant(Role::Admin));
        assert!(!Role::Admin.can_grant(Role::Owner));

        assert!(Role::Owner.can_grant(Role::Owner));
        assert!(!Role::Member.can_grant(Role::Member));
    }

    #[test]
    fn should_round_trip_through_strings() {
        for role in [Role::Member, Role::Admin, Role::Owner] {
            assert_eq!(role.as_str().parse::<Role>().unwrap(), role);
        }
        assert!("superuser".parse::<Role>().is_err());
    }

    #[test]
    fn should_order_roles_by_privilege() {
        assert!(Role::Owner > Role::Admin);
        assert!(Role::Admin > Role::Member);
    }

    #[test]
    fn should_reject_a_short_password() {
        assert!(validate_password("123456789").is_err());
        assert!(validate_password("1234567890").is_ok());
    }

    #[test]
    fn should_count_characters_not_bytes_in_a_password() {
        // Ten characters, thirty bytes. Counting bytes would wrongly accept
        // shorter passwords made of multi-byte characters, and wrongly
        // reject nothing; counting characters is the honest limit.
        assert!(validate_password("日本語日本語日本語語").is_ok());
        assert!(validate_password("日本語").is_err());
    }

    #[test]
    fn should_normalize_email_case_and_whitespace() {
        assert_eq!(normalize_email("  Azlan@Example.COM "), "azlan@example.com");
    }

    #[test]
    fn should_accept_ordinary_addresses() {
        for email in ["a@b.co", "azlan@boneconsulting.com", "x+tag@sub.domain.id"] {
            assert!(validate_email(email).is_ok(), "{email}");
        }
    }

    #[test]
    fn should_reject_malformed_addresses() {
        for email in ["", "no-at-sign", "@example.com", "a@", "a@b", "a@@b.com"] {
            assert!(validate_email(email).is_err(), "{email}");
        }
    }
}
