-- Operator console roles (CSL-2, D125).
--
-- Roles are rows, so an owner can make and edit them in the console. The
-- permissions a role may hold are a fixed list, checked here and mirrored by
-- `ConsolePermission` in the domain crate: a permission is only real when an
-- API route checks it, so a new one arrives with a release, not as a row.
--
-- Not workspace-scoped: the console works across workspaces, and these
-- tables belong to no workspace (docs/data-model.md#console_roles).
CREATE TABLE console_roles (
    id          text PRIMARY KEY,
    name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    description text CHECK (char_length(description) <= 200),
    -- A system role is seeded here and never edited or deleted, so the
    -- console always has one role that can manage the rest.
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz
);

CREATE UNIQUE INDEX console_roles_name_idx ON console_roles (lower(name))
    WHERE deleted_at IS NULL;

-- A link table: changing a role's permissions replaces its rows. They are
-- not user data and carry nothing to restore, so they are deleted rather
-- than soft-deleted; the change itself is kept in the operator audit.
CREATE TABLE console_role_permissions (
    role_id    text NOT NULL REFERENCES console_roles (id) ON DELETE CASCADE,
    permission text NOT NULL CHECK (permission IN (
        'console.read',
        'console.feedback.write',
        'console.users.disable',
        'console.workspaces.suspend',
        'console.workspaces.restore',
        'console.operators.manage',
        'console.roles.manage',
        'console.audit.read'
    )),
    PRIMARY KEY (role_id, permission)
);

-- Null for everyone who is not an operator, which is nearly everyone.
ALTER TABLE users ADD COLUMN console_role_id text REFERENCES console_roles (id);

CREATE INDEX users_console_role_idx ON users (console_role_id)
    WHERE console_role_id IS NOT NULL;

INSERT INTO console_roles (id, name, description, is_system) VALUES
    ('owner', 'Owner', 'Everything, including operators and roles.', true),
    ('support', 'Support', 'Reads everything, answers feedback, disables users.', false),
    ('viewer', 'Viewer', 'Reads everything, changes nothing.', false);

INSERT INTO console_role_permissions (role_id, permission) VALUES
    ('owner', 'console.read'),
    ('owner', 'console.feedback.write'),
    ('owner', 'console.users.disable'),
    ('owner', 'console.workspaces.suspend'),
    ('owner', 'console.workspaces.restore'),
    ('owner', 'console.operators.manage'),
    ('owner', 'console.roles.manage'),
    ('owner', 'console.audit.read'),
    ('support', 'console.read'),
    ('support', 'console.feedback.write'),
    ('support', 'console.users.disable'),
    ('viewer', 'console.read');
