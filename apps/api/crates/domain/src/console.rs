//! What an operator may do in the console (CSL-2, D125).
//!
//! Roles are rows an owner edits; permissions are this list. A permission
//! means something only because a route checks it, so the list is code, and
//! the `CHECK` on `console_role_permissions.permission` in migration 0022
//! holds the same keys.

use serde::{Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ConsolePermission {
    /// Every console screen that only reads.
    Read,
    FeedbackWrite,
    UsersDisable,
    WorkspacesSuspend,
    WorkspacesRestore,
    OperatorsManage,
    RolesManage,
    AuditRead,
}

impl ConsolePermission {
    pub const ALL: [Self; 8] = [
        Self::Read,
        Self::FeedbackWrite,
        Self::UsersDisable,
        Self::WorkspacesSuspend,
        Self::WorkspacesRestore,
        Self::OperatorsManage,
        Self::RolesManage,
        Self::AuditRead,
    ];

    /// The stable key, stored in the database and sent to the app.
    pub fn key(self) -> &'static str {
        match self {
            Self::Read => "console.read",
            Self::FeedbackWrite => "console.feedback.write",
            Self::UsersDisable => "console.users.disable",
            Self::WorkspacesSuspend => "console.workspaces.suspend",
            Self::WorkspacesRestore => "console.workspaces.restore",
            Self::OperatorsManage => "console.operators.manage",
            Self::RolesManage => "console.roles.manage",
            Self::AuditRead => "console.audit.read",
        }
    }

    pub fn parse(key: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|permission| permission.key() == key)
    }
}

impl Serialize for ConsolePermission {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.key())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_every_key_back_to_its_permission() {
        for permission in ConsolePermission::ALL {
            assert_eq!(ConsolePermission::parse(permission.key()), Some(permission));
        }
        assert_eq!(ConsolePermission::parse("console.everything"), None);
    }

    #[test]
    fn should_serialize_as_the_key() {
        let json = serde_json::to_string(&ConsolePermission::UsersDisable).unwrap();
        assert_eq!(json, r#""console.users.disable""#);
    }
}
