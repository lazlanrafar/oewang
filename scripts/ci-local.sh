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

passed=()
failed=()

step() {
	local name="$1"
	shift
	printf '\n\033[1m== %s\033[0m\n' "$name"
	if "$@"; then
		passed+=("$name")
	else
		failed+=("$name")
	fi
}

in_container() { "${COMPOSE[@]}" run --rm --no-deps "$@"; }

# -- secret scan: the commits this branch adds over main, as ci.yml did on a PR.
step "secret scan" docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.24.3 \
	detect --config .github/gitleaks.toml --redact --log-opts="origin/main..HEAD"

# -- docs: the generated configuration reference and requirement coverage.
step "docs: env vars" python3 scripts/env-vars.py --check
step "docs: coverage" python3 scripts/coverage.py

# -- api: one container, the same order as the CI job.
step "api: fmt" in_container api cargo fmt --all --check
step "api: migrate" in_container api sqlx migrate run --source migrations
step "api: sqlx cache current" in_container -e SQLX_OFFLINE=false api \
	cargo sqlx prepare --workspace --check -- --all-targets
step "api: clippy" in_container api cargo clippy --all-targets -- -D warnings
step "api: test" in_container api cargo test

# -- ai
step "ai: ruff" in_container ai uv run ruff check .
step "ai: pytest" in_container ai uv run pytest -q

# -- app
step "app: check" in_container app bun run check
step "app: test" in_container app bun run test

if $E2E; then
	step "e2e: journeys and axe" bash -c \
		'cd apps/app && E2E_BASE_URL=http://localhost:3000 E2E_CHAT=0 bun run test:e2e'
fi

printf '\n\033[1m== Summary\033[0m\n'
for name in "${passed[@]}"; do printf '  \033[32mpass\033[0m  %s\n' "$name"; done
for name in "${failed[@]}"; do printf '  \033[31mFAIL\033[0m  %s\n' "$name"; done
[[ ${#failed[@]} -eq 0 ]]
