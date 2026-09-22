import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { db } from "@workspace/database";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AiRepository } from "../../modules/ai/ai.repository";

afterEach(() => mock.restore());

describe("AI session privacy contract", () => {
  for (const operation of ["list", "metadata", "messages"] as const) {
    it(`should scope ${operation} to the authenticated user or legacy archives`, async () => {
      let predicate: SQL | undefined;
      let joined = false;
      const query = {
        from: () => query,
        innerJoin: () => {
          joined = true;
          return query;
        },
        where: (value: SQL) => {
          predicate = value;
          return query;
        },
        orderBy: () => (operation === "list" ? Promise.resolve([]) : query),
        limit: () => Promise.resolve([]),
      };
      // Fake only the database executor; compile the real Drizzle predicate.
      spyOn(db, "select").mockReturnValue(
        query as unknown as ReturnType<typeof db.select>,
      );
      if (operation === "list")
        await AiRepository.getSessions("workspace", "authenticated-user");
      if (operation === "metadata")
        await AiRepository.getSession(
          "guessed-id",
          "workspace",
          "authenticated-user",
        );
      if (operation === "messages")
        await AiRepository.getSessionMessages(
          "guessed-id",
          "workspace",
          "authenticated-user",
        );
      expect(predicate).toBeDefined();
      const sql = new PgDialect().sqlToQuery(predicate!);
      expect(sql.sql).toContain('"ai_sessions"."user_id" =');
      expect(sql.sql).toContain('or "ai_sessions"."user_id" is null');
      expect(sql.sql).toContain('"ai_sessions"."workspace_id" =');
      expect(sql.sql).toContain('"ai_sessions"."deleted_at" is null');
      expect(sql.params).toContain("authenticated-user");
      expect(sql.params).toContain("workspace");
      if (operation === "messages") {
        expect(joined).toBe(true);
        expect(sql.sql).toContain('"ai_messages"."deleted_at" is null');
      }
    });
  }
});
