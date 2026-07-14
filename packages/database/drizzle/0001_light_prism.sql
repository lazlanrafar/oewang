-- Hot-path indexes only. drizzle-kit generate also emitted CREATE TABLE / ADD
-- COLUMN statements for schema drift that was already applied to prod via
-- `db:push` (migration 0000 predates it) — those were removed by hand; the
-- 0001 snapshot still captures the full current schema so future generates
-- diff correctly. IF NOT EXISTS keeps this re-runnable against db:push'd DBs.
CREATE INDEX IF NOT EXISTS "ai_messages_session_created_idx" ON "ai_messages" USING btree ("session_id","created_at") WHERE "ai_messages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_workspace_entity_idx" ON "audit_logs" USING btree ("workspace_id","entity","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_workspace_user_created_idx" ON "notifications" USING btree ("workspace_id","user_id","created_at" DESC NULLS LAST) WHERE "notifications"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_workspace_date_idx" ON "transactions" USING btree ("workspace_id","date" DESC NULLS LAST,"created_at" DESC NULLS LAST) WHERE "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_wallet_id_idx" ON "transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_category_id_idx" ON "transactions" USING btree ("category_id");
