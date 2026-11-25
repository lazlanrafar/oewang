#!/usr/bin/env bash
# The CI suite, run on this machine instead of GitHub Actions.
#
# GitHub CI is switched off for now to save Actions minutes (owner's call,
# 2026-11-06); .github/workflows/ci.yml only runs by hand. Run this before
# a big feature goes to `main`. It mirrors ci.yml job by job, inside the
# dev containers like every other check here (CLAUDE.md), so it needs the
# stack's postgres running: `docker compose -f infra/docker-compose.yml up -d`.
#
#   scripts/ci-local.sh          every check except the browser journeys
#   scripts/ci-local.sh --e2e    also the journeys and axe, against the
#                                running stack at http://localhost:3000
#
# Exits non-zero when any check fails, after running all of them, so one
# run shows everything that is red.

set -uo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f infra/docker-compose.yml)
E2E=false
[[ "${1:-}" == "--e2e" ]] && E2E=true

RESULTS=$(mktemp)

# One check: its name and time go to RESULTS for the summary.
step() {
	local name="$1"
	shift
	printf '\n== %s\n' "$name"
	local start=$SECONDS
	if "$@"; then
		echo "pass|$name ($((SECONDS - start))s)" >>"$RESULTS"
	else
		echo "FAIL|$name ($((SECONDS - start))s)" >>"$RESULTS"
	fi
}

in_container() { "${COMPOSE[@]}" run --rm --no-deps "$@"; }
# The dev api's `cargo watch` builds in /cargo-target. Checks built there too
# held its lock, so its rebuild after `sqlx prepare` touched the sources
# finished minutes later, mid-journeys, and restarted the api under them.
API_TARGET=(-e CARGO_TARGET_DIR=/cargo-target/ci)

group_e2e() {
	# Settled means the last thing `cargo watch` did was start the api:
	# a quiet log is not enough, one crate can compile for minutes silently.
	step "e2e: api settled" bash -c '
		for _ in $(seq 1 120); do
			last=$(docker compose -f infra/docker-compose.yml logs --since 30m api 2>&1 \
				| sed -E "s/\x1b\[[0-9;]*m//g" | grep -E "\[Running|listening addr" | tail -1)
			if [[ "$last" == *"listening addr"* ]] && curl -sf -o /dev/null http://localhost:3002/health; then
				exit 0
			fi
			sleep 5
		done
		exit 1'
	# A retry stays, reported as flaky rather than hidden.
	step "e2e: journeys and axe" bash -c \
		'cd apps/app && E2E_BASE_URL=http://localhost:3000 E2E_CHAT=0 bun run test:e2e -- --workers=2 --retries=1'
}

group_api() {
	step "api: fmt" in_container "${API_TARGET[@]}" api cargo fmt --all --check
	step "api: migrate" in_container api sqlx migrate run --source migrations
	# On a copy of the sources: `sqlx prepare` touches them to force the
	# macros to rerun, and the mounted tree is the dev api's.
	step "api: sqlx cache current" in_container "${API_TARGET[@]}" -e SQLX_OFFLINE=false api \
		sh -c 'cp -a /app /tmp/src && cd /tmp/src && cargo sqlx prepare --workspace --check -- --all-targets'
	step "api: clippy" in_container "${API_TARGET[@]}" api cargo clippy --all-targets -- -D warnings
	step "api: test" in_container "${API_TARGET[@]}" api cargo test
}

group_ai() {
	step "ai: ruff" in_container ai uv run ruff check .
	step "ai: pytest" in_container ai uv run pytest -q
}

group_app() {
	step "app: check" in_container app bun run check
	step "app: test" in_container app bun run test
}

# On the host, not in a container (iOS needs Xcode, D113).
group_native() {
	step "native: analyze" bash -c 'cd apps/native && flutter pub get >/dev/null && flutter analyze'
	step "native: test" bash -c 'cd apps/native && flutter test'
}

# -- quick checks first, in this shell.
# Secret scan: the commits this branch adds over main, as ci.yml did on a PR.
step "secret scan" docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.24.3 \
	detect --config .github/gitleaks.toml --redact --log-opts="origin/main..HEAD"
step "docs: env vars" python3 scripts/env-vars.py --check
step "docs: coverage" python3 scripts/coverage.py

groups=(api ai app native)
$E2E && groups=(e2e "${groups[@]}")
# One group at a time: side by side they pinned every core of the laptop
# (owner's call, 2026-11-24), for about two minutes saved.
for g in "${groups[@]}"; do "group_$g"; done

printf '\n\033[1m== Summary\033[0m\n'
grep '^pass|' "$RESULTS" | while IFS='|' read -r _ name; do printf '  \033[32mpass\033[0m  %s\n' "$name"; done
fails=$(grep -c '^FAIL|' "$RESULTS")
grep '^FAIL|' "$RESULTS" | while IFS='|' read -r _ name; do printf '  \033[31mFAIL\033[0m  %s\n' "$name"; done
printf '  total %ss\n' "$SECONDS"

[[ $fails -eq 0 ]]
