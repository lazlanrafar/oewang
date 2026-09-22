# AI memory verification and rollout

Implementation verified on 2026-09-22. No production database, OCR provider,
model provider, or live Telegram account was used by the automated tests.

## Verified behavior

- User-global language/style and user/workspace financial preferences persist;
  other users and workspaces cannot read or overwrite another scope.
- Disabled memory does not read values or accept preference writes. Memory
  outages preserve active-session language and do not claim successful writes.
- Private sessions reject another user or an unverified/nonpersonal channel.
  Legacy null-owner archives are readable but continuation creates a new private
  session without copying messages.
- Indonesia → image without caption → BCA → simpan retains Indonesian.
  A clear English request changes language; the next image retains English.
- Controlled OCR previews include every item, unknown quantities/prices,
  fractional quantities, multiple receipts, subtotal discrepancies, and markup.
- Confirmation inserts one transaction per receipt, line items, balance update,
  and audit in one transaction. Concurrent replays do not duplicate any of these;
  failed item insertion rolls back the transaction and balance. Cancellation and
  questions about saving do not invoke transaction creation.
- Controlled LLM tools use authenticated caller identity even if model arguments
  include another user/workspace. Financial memory needs explicit current-user
  evidence. Generic acknowledgements cannot confirm bulk memory deletion.
- Telegram HTTP tests cover verified/private sender, groups, wrong sender,
  revoked membership, legacy linkage, caption/session forwarding, receipt
  attachments, Unicode chunk boundaries, and literal rendering of OCR markup.

## Commands and results

- `cd apps/ai && .venv/bin/pytest -q`: Python unit suite. Database integration
  tests skip unless the dedicated variable below is set.
- `AI_MEMORY_TEST_URL=postgresql://<local-user>@127.0.0.1:55439/oewang_ai_memory_test apps/ai/.venv/bin/pytest -q apps/ai/tests`:
  **163 passed, 1 skipped**, including **8 real-Postgres integration tests**.
  The skipped test is the pre-existing `RUN_DB_TESTS` money-path test; it uses a
  different database/seed contract and was not pointed at the application DB.
- `cd apps/api && bun test modules/`: **373 passed**. The privacy wrapper runs
  three additional isolated SQL-predicate contracts. No live API server required.
- `cd apps/worker && go test ./... && go vet ./...`: passed.
- API and database package `typecheck`: passed.
- Ruff on the changed Python modules/tests: passed. Biome on changed TS/schema
  files: no errors; existing static-only-class/explicit-any warnings remain.

The dedicated Postgres 16 instance was initialized in `/tmp/oewang-ai-memory-pg`
on loopback port 55439. Baseline migration `0000` and generated feature migration
`0002_ai_user_memory.sql` applied successfully. The integration fixture adds the
pre-existing transaction-item/multicurrency prerequisites missing from the old
baseline. It never reads application `DATABASE_URL`, requires a localhost URL
and a database name ending `_test`, and uses generated fixture IDs. No schema
changes are applied to production by these tests.

## Rollout and manual test

1. Apply generated migration 0002 to the designated deployment test database.
   It adds memory state and session ownership; it never assigns legacy owners.
2. Deploy the matching API, AI sidecar and worker together. Python now owns draft
   and session persistence; do not mix the legacy worker's duplicate persistence
   path with the new sidecar.
3. Link the test Telegram chat through the authenticated dashboard/API connection
   endpoint. The historical raw Telegram `/connect` command is not identity
   proof and does not enable personal memory. Do not backfill verification from
   first-member or `connected_by` fallback data.
4. On the real test bot, send Indonesian text, upload a receipt without caption,
   choose BCA, then confirm. Check every item, one transaction and the balance.
   Repeat with clear English text, a second photo, cancellation, memory listing,
   correction, disable/enable, and confirmed bulk deletion.
5. Check the application with two users in one workspace, a second workspace,
   guessed session IDs, and a legacy archive. Verify remembered language across
   app/Telegram sessions but isolated financial preferences.

**Live Telegram verification is pending:** no authorized test chat/workspace was
identified during implementation. The deterministic tests above do not establish
real OCR accuracy, model phrasing quality, or actual Telegram delivery behavior.
The language detector currently supports Indonesian and English conservatively;
ambiguous text preserves the previous language.
