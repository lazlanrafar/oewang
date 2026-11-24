#!/usr/bin/env bash
# verify-go.sh — Quality gate for Go projects.
# Run from the Go module root. Exits non-zero on any failure.
set -euo pipefail

echo "=== Go Quality Gate ==="

echo "[1/5] gofmt check"
UNFORMATTED=$(gofmt -s -l .)
if [ -n "${UNFORMATTED}" ]; then
  echo "Unformatted files:"
  echo "${UNFORMATTED}"
  exit 1
fi

echo "[2/5] go vet"
go vet ./...

echo "[3/5] golangci-lint"
if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run
fi

echo "[4/5] govulncheck"
if command -v govulncheck >/dev/null 2>&1; then
  govulncheck ./...
fi

echo "[5/5] go test -race"
go test -race ./...

echo ""
echo "✓ All Go quality checks passed"
