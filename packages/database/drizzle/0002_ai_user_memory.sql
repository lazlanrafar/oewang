CREATE TABLE "ai_user_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"scope_key" text NOT NULL,
	"kind" text NOT NULL,
	"memory_key" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "ai_user_memories_scope_check" CHECK (("ai_user_memories"."workspace_id" IS NULL AND "ai_user_memories"."scope_key" = 'global' AND "ai_user_memories"."kind" IN ('language', 'style')) OR ("ai_user_memories"."workspace_id" IS NOT NULL AND "ai_user_memories"."scope_key" = "ai_user_memories"."workspace_id" AND "ai_user_memories"."kind" IN ('wallet', 'category', 'fact')))
);

--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN "personal_memory" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_memory_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_user_memories" ADD CONSTRAINT "ai_user_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_user_memories" ADD CONSTRAINT "ai_user_memories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_user_memories_live_key" ON "ai_user_memories" USING btree ("user_id","scope_key","kind","memory_key") WHERE "ai_user_memories"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "ai_user_memories_user_scope_idx" ON "ai_user_memories" USING btree ("user_id","workspace_id") WHERE "ai_user_memories"."deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;