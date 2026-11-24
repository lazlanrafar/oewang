# Boekti Wiki, Docs & E2E Reference

Read this reference when syncing PRDs, feature specifications, Decision Log entries, or E2E evidence with **Boekti** (`https://boekti.lazlanrafar.com`).

---

## 1. Boekti Ticket & Session Flow

1. **Start**:
   - Read the ticket once with the Boekti MCP tool `get_item` (key like `<PROJECT>-12`). Read it again only when the user asks.
   - Name the branch `<PROJECT>-12-short-slug` and include the ticket key in every commit message.
   - If working on a shared branch without a key (`main` / `development`), bind the session once with `boekti session ticket <PROJECT>-12`.
2. **Overlaps & Denied Edits**:
   - An overlap note means another session is working on a related ticket/file — stay off the files it holds.
   - A denied edit means another session claims that file. Never bypass the hook; comment on the ticket with `add_comment` naming the file and ask the user.
   - Use `boekti session release <path>` only when the deny message confirms the holder is your own stale session.
3. **Finish & E2E Evidence**:
   - Run the local E2E suite producing a machine-readable report (Playwright `--reporter=junit`, Cucumber JSON, Robot `output.xml`, or Go JUnit XML) plus screenshots/videos.
   - Upload evidence: `boekti e2e --item <PROJECT>-12 --report e2e.xml --evidence test-results/`.
   - Move the ticket status via `update_items` and post one concise summary via `add_comment` (what changed, how it was tested, what run ID Boekti recorded, and what remains).

---

## 2. Boekti Wiki Docs Rules (Token Budget — D187)

When a repository stores its PRD, architecture, and feature docs in the project's Boekti wiki (like `BOEKTI` and `BOX`):

- **Read (Never Preload)**:
  1. Find the page with MCP `search` or `list_documents` (pass `project` and `source_path`, e.g., `features/order/README.md`).
  2. Call `get_document` with `outline: true` first, then fetch only the specific `section` needed. Read the whole page only when it is short or you are about to update it with `save_page`.
  3. Do not re-read a page already read in the current session.
- **Write (`save_page`)**:
  - **One topic per page**.
  - **Line 1 is always a one-sentence summary** (shown in indexes and outlines).
  - **Current state only**: describe how the system works now; historical context belongs in page versions and the Decision Log.
  - **Size caps**: keep pages under **~1,500 words** and individual sections under **~600 words**. Split larger features into child pages under a feature folder (`README.md` overview + child pages for `database`, `api`, `frontend`, `tests`).
  - **Style**: prefer tables and bullets over prose; reference code as `path:line` rather than pasting large code blocks; English only; short sentences; no em/en dashes.
  - **Decision Log rows**: when behavior or architecture changes, update the owning wiki page with `save_page` (passing the `version` you read) AND add a Decision Log row (`D<xx>`: decision, why, and rejected alternatives in 1–2 sentences each) in the same task.
- **Naming**:
  - Folders: lowercase kebab-case nouns, max 3 levels deep, each with `README.md`.
  - Files: lowercase kebab-case `.md`, no dates, no ordering numbers, and do not repeat the parent folder name (`api/errors.md`, not `api/api-errors.md`).
  - Titles: sentence case, max 6 words, unique in the space.

---

## 3. Team Memory (`read_memory` / `save_memory`)

- Open a memory topic with `read_memory` (`project`, `topic`) only when the task touches that subject.
- Call `save_memory` (`project`, `topic`, `text`, max 4,000 chars) **only for non-code facts** that cannot be read from the codebase, wiki, or git log (e.g., deployment traps, external environment quirks, user preferences).
- Never store secret values, tokens, or credentials in memory or wiki pages.
