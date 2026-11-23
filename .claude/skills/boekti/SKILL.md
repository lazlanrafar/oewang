---
name: boekti
description: Boekti ticket, PRD discovery, planning, wiki docs, memory and e2e flow for this repo. Use when starting a ticket, clarifying scope or planning a feature (ask, never assume), naming a branch or commit, needing or changing project docs, saving a project fact or a credential, on a Boekti deny or overlap, or when finishing.
---

# Boekti flow

Hooks report this session, claim the files you edit and print the memory topics at start.
Never check or poll Boekti yourself. Project: `OEW`.

## Start
1. Read the ticket once with the Boekti MCP tool `get_item` (key like `OEW-12`). Read it
   again only when the person asks. Move it to In progress with `start_date` today.
2. Branch `OEW-12-short-slug`. Every commit message names the key.
3. Branch without a key (main, a shared branch): run `boekti session ticket OEW-12` once.
4. A ticket you create: title `TYPE(Scope): description`, assigned to the project lead
   ([reference.md](reference.md#ticket)).

## Plan and scope (ask, never assume)
- Inspect the owning wiki page (`outline: true`) and connected code before asking questions.
- If scope, user flow, permission, data invariant or edge case is open, **stop and ask the person**
  (3 to 5 concrete questions with a recommended option and trade-offs; never guess).
- Lock in the vertical-slice file plan and get approval before coding ([reference.md](reference.md#planning-and-prd)).

## Docs (the project's Boekti wiki)
- Docs live in the wiki of `OEW`, not the repo. Never preload: when a task needs one, find
  it with `search` or `list_documents` (project `OEW`), read it with `get_document`.
- When behavior changes, update the owning page with `save_page` (its id and the version you
  read) in the same task.
- Read, write and name docs by the rules in [reference.md](reference.md#docs-rules-token-budget).

## Memory
- Open a memory topic (a wiki page) with `read_memory` (project `OEW`) only when needed.
- `save_memory` (project `OEW`, a topic such as `Deploy`) only for facts the repo
  cannot tell: decisions, preferences, traps outside the code. `mode: replace` when a topic
  is wrong. Never a secret value.

## Credentials
- Every credential you create or get (account, key, token, DB URL, password) goes to
  the vault in the same task: `save_secret` (project `OEW`) or `boekti secret save`.
  Check `list_documents` first: a save with the same title updates that secret. Never put a
  value in the repo, memory, comments or the wiki.

## Overlaps and denied edits
- An overlap note means another session works on a related ticket or file. Keep going, and
  stay off the files it holds.
- A denied edit means another session holds that file. Never work around the hook (no other
  tool, no shell redirect, no copy). Comment on the ticket with `add_comment` naming the file,
  then do other work or ask the person.
- `boekti session release <path>` only when the holder is your own stale session.

## Finish
1. Run the e2e tests locally (formats and evidence: [reference.md](reference.md)).
2. `boekti e2e --item OEW-12 --report <report file> --evidence <screenshots dir>`
3. Move the ticket with `update_items` and `due_date` today, then leave one short summary with `add_comment`:
   what changed, how it was tested, what is left.
4. Remove each worktree you or your agents used once its branch merged: `git worktree remove`
   then `git branch -d`. Never one with uncommitted changes, locked or in use.
