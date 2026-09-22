/** Generate only this additive feature against the checked-in baseline.
 * Other tables have pre-existing schema/snapshot drift; do not migrate them here.
 * SQL is produced by Drizzle, never handwritten. Run from packages/database.
 */
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { aiSessions } from "../schema/ai-sessions";
import { aiUserMemories } from "../schema/ai-user-memories";
import { users } from "../schema/users";
import { workspaces } from "../schema/workspaces";

const previous = await Bun.file("drizzle/meta/0001_snapshot.json").json();
const generated = generateDrizzleJson({ aiSessions, aiUserMemories, users, workspaces }, previous.id);
const current = structuredClone(previous);
current.id = generated.id;
current.prevId = previous.id;
current.tables["public.ai_user_memories"] = generated.tables["public.ai_user_memories"];
for (const [table, columns] of Object.entries({
  ai_sessions: ["user_id", "personal_memory", "context"],
  users: ["ai_memory_enabled"],
})) {
  for (const column of columns) {
    current.tables[`public.${table}`].columns[column] = generated.tables[`public.${table}`]!.columns[column];
  }
}
current.tables["public.ai_sessions"].foreignKeys = generated.tables["public.ai_sessions"]!.foreignKeys;
const statements = await generateMigration(previous, current);
if (statements.some((statement) => /DROP |RENAME /i.test(statement))) throw new Error("Expected additive migration only");
const tag = "0002_ai_user_memory";
const journal = await Bun.file("drizzle/meta/_journal.json").json();
if (journal.entries.some((entry: { tag: string }) => entry.tag === tag)) throw new Error("Migration already generated");
await Bun.write(`drizzle/${tag}.sql`, statements.join("\n--> statement-breakpoint\n"));
await Bun.write("drizzle/meta/0002_snapshot.json", JSON.stringify(current, null, 2));
journal.entries.push({ idx: 2, version: "7", when: Date.now(), tag, breakpoints: true });
await Bun.write("drizzle/meta/_journal.json", JSON.stringify(journal, null, 2));
