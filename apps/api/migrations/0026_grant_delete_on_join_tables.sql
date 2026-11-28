-- The application role may replace the rows of two console join tables.
--
-- Saving a plan's features and a console role's permissions deletes the
-- set and inserts the new one (repositories/console.rs). The default
-- privileges give `oewang_app` SELECT, INSERT and UPDATE on every new
-- table but never DELETE (docs/deployment.md), so both saves failed in
-- production with "permission denied" while passing locally, where one
-- role does everything. Neither table holds workspace data, so soft
-- delete (OPS-2) does not apply, and each change is audited with the set
-- before and after (CSL-14).
--
-- Guarded: development and test databases have no `oewang_app` role.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oewang_app') THEN
        GRANT DELETE ON plan_features, console_role_permissions TO oewang_app;
    END IF;
END
$$;
