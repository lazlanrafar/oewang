# Boekti flow: reference

Read this only when the skill points here. Project `OEW`, server `https://boekti.lazlanrafar.com`.

## Planning and PRD

1. **Look before you ask**: read the ticket (`get_item`), the owning wiki page (`list_documents`
   or `search` -> `get_document` with `outline: true`, then one `section`) and the connected code.
   Never ask what the repo or wiki already answers.
2. **Ask, never assume**: when creating a feature or changing behavior, never silently invent
   business rules, permissions, money/points math, state transitions or UI layouts. Echo what is
   understood in under 100 words, then ask 3 to 5 targeted questions (recommended option first,
   with a one-line trade-off) covering the 7 checkpoints:
   - **Scope & non-goals**: smallest complete v1 vs what is explicitly out.
   - **Actors, permissions & tenancy**: permission key (never hardcode role names) and tenant
     scope (`organization_id`, `workspace_id`, `outlet_id`).
   - **User flow & UI surface**: entry point, URL query state (filters, search, sort, tab),
     atomic components (`atoms`, `molecules/select-*`, `organisms/{module}/{module}-*`), and
     the two empty states ("none yet" vs "none matching").
   - **Data model & invariants**: tables/columns, prefixed CUID2 IDs, soft delete (`deleted_at`),
     no float money, relative balance updates in SQL (`WHERE balance >= cost`).
   - **Edge cases & failure modes**: idempotency, rollback/cancel, cataloged error codes.
   - **Audit & side effects**: activity, audit row, notifications and background jobs written in
     the same DB transaction.
   - **Trade-offs**: when 2 to 3 valid designs exist, present pros/cons and let the person pick.
3. **Vertical-slice plan**: before coding a multi-file feature, list the exact files to create or
   edit across `DB/migrations -> Repository/sqlc -> Service -> Controller/Handler -> MCP -> UI ->
   Tests -> Wiki page & Decision log`, and wait for approval.

## E2E evidence

1. Run the project's e2e suite locally, with a machine-readable report:
   - Playwright: `--reporter=junit` (or `PLAYWRIGHT_JUNIT_OUTPUT_NAME=e2e.xml`).
   - Cypress: the `junit` reporter. Cucumber: `--format json:e2e.json`. Robot: `output.xml`.
   - Go or other unit runners also work when they write JUnit XML.
2. Keep screenshots or videos of the checked screens in one folder (PNG, JPEG, WebM or MP4).
3. Upload both: `boekti e2e --item OEW-12 --report e2e.xml --evidence test-results/`
   The format comes from the file content. A failing run is evidence too: upload it, then fix.
4. In the summary comment, name the run Boekti printed and say what is not covered.

## Ticket

- Titles, epics too: `TYPE(Scope): description`, e.g. `FEAT(User Management): add user
  invitation`. Scope = module, reuse the project's existing names; description lowercase,
  imperative. TYPE: FEAT new feature, FIX bug, IMPROVE existing feature, REFACTOR code
  structure, CHORE maintenance, DOCS, TEST, SPIKE research, SECURITY, DESIGN UI/UX.
- Assignee of a ticket you create: the project lead (`lead` in `get_project`). Timeline:
  `start_date` when work starts, `due_date` the day it is done.
- `get_item` answers the last 3 comments, cut short. `list_comments` only when the person says
  someone answered; `response_format: detailed` only when the cut text matters.
- Status names are the project's own (`update_items` with `status`); an unknown name answers
  the valid ones.
- Running as a subagent: the session that started you owns the ticket. Do not read it, comment
  on it or move it; report back to that session.

## Docs

- The wiki of `OEW` is the source of truth; the repo keeps only `CLAUDE.md`,
  `AGENTS.md` and `README.md`, pointing at it. `boekti docs pull <dir>` writes the pages to a
  folder for offline reading; edits go back through `save_page`, not through that copy.
- `save_page` replaces the whole content (Markdown): read with `get_document`, change, save with
  the version you read. A new page: `save_page` with `project`, `title`, `parent` (a page id).
- A `docs/...md#anchor` path in code or memory names the page pushed from that file:
  `list_documents` with `source_path` relative to the pushed folder (`api/errors.md`).
- Behavior changed: add a decision log row beside the page update.
- Lasting facts that are not docs go to `save_memory`.

## Docs rules (token budget)

- Read: `get_document` with `outline: true`, then the one `section` you need. Read a whole page
  only when it is short. Do not re-read a page you read this session.
- Write: one topic per page. The first line is a one-sentence summary (indexes and outlines show
  it). Current state only: history lives in versions and the decision log. Over about 1,500
  words, split into child pages by topic. Link instead of repeating. Tables and bullets over
  prose. Point at code as `path:line`; never paste large code. Decision log rows: decision, why,
  alternatives, one or two sentences each.
- Name: folders are lowercase kebab-case nouns for an area, at most 3 levels, each with a
  `README.md` as its overview. Files are lowercase kebab-case `.md`, one topic, with no dates,
  ordering numbers, version suffixes or repeated folder names (`api/errors.md`, not
  `api/api-errors.md`). Titles: sentence case, at most 6 words, unique in the space, no prefix
  repeating the parent. Images go in `images/` next to the page, named `<page>-<what>.png`.
- Push: `boekti docs push` warns, and goes on, on a page over 1,500 words, a section over 600
  words, a file or folder name that is not kebab-case, and a title used twice in the space.

## Memory

- Good: "Staging deploys need `bun run build:app` first; CI does not run it." Bad: anything
  readable from the code, the docs or git log.
- One topic page per subject (`Deploy`, `API conventions`); its first line is the summary
  the index shows, so lead with the fact. At most 4,000 characters per save. The server
  refuses text the topic already says (`memory.duplicate`).

## Sessions and claims

- The session starts at the session start hook and follows the branch; `OEW-<n>` in
  the branch name sets the ticket.
- Each edit claims its file for this session. A claim drops when the session is idle for
  10 minutes or ends.
- `boekti session release <path>` releases a claim held by one of your own sessions (for
  example a terminal you closed without ending the session).
- Boekti keeps what a session does now, not a history: its current step and its running
  subagents. `boekti status` prints every live session of the project; it is for people, in a
  terminal. Do not run it to check on yourself.

## Parallel agents

- `boekti init` installs all active Boekti organization agents and attached skills into
  `.claude/agents/`, `.opencode/agents/`, `.agents/plugins/boekti/agents/`, `.claude/skills/`,
  and `.agents/skills/`. Run `boekti agent sync` after changing agents or skills on the server.
- **In-session subagents:** Claude Code reports each running subagent as its own row under the
  session, with its own step. A subagent in a git worktree on a branch that names another ticket
  shows that ticket; otherwise it shows the session's. Antigravity's `invoke_subagent` is one
  step of the session.
- **Parallel terminals / worktrees:** Export `BOEKTI_AGENT=<handle>` per terminal (for example
  `BOEKTI_AGENT=qa-engineer claude`) or use git worktrees (`.claude/worktrees/<name>`). Hooks
  normalize file claims to the worktree-relative repository path and read each worktree's branch.
  One branch per ticket: two terminals on one branch show one ticket, unless each names its
  own: `BOEKTI_AGENT=qa-engineer BOEKTI_TICKET=OEW-14 claude`. With several sessions in
  one repository, `boekti session ticket` needs `--session <id> --cli <cli>`.

## Codex, OpenCode and Antigravity

- Codex and OpenCode read `AGENTS.md`, not this skill. Their hooks (`.codex/hooks.json`) and
  plugin (`.opencode/plugins/boekti.ts`) do the same work as the Claude Code hooks.
- Antigravity reads `AGENTS.md`, `.agents/skills/boekti/`, `.agents/hooks.json`, and workspace
  subagents in `.agents/plugins/boekti/agents/` (using global `~/.gemini/config/mcp_config.json`).
- Their MCP entries read the token from `BOEKTI_TOKEN`: `export BOEKTI_TOKEN=$(boekti token)`
  in the shell that starts them. Never write the token into a file of the repository.
- OpenCode 2 reads MCP servers under `mcp.servers`: `{"mcp":{"servers":{"boekti":{"type":"remote",
  "url":"https://boekti.lazlanrafar.com/mcp","headers":{"Authorization":"Bearer {env:BOEKTI_TOKEN}"},"oauth":false}}}}`.
  `boekti init` writes that shape when `opencode.json` already uses it.

## When something is off

- No Boekti block at session start: not logged in (`boekti login`), another server in
  `.boekti.json`, or the server is down. Work continues; the latest step is sent later.
- `BOEKTI_DEBUG=1` makes the hooks print their errors to stderr.
