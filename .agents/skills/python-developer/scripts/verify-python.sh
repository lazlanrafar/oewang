#!/usr/bin/env bash
# verify-python.sh — Quality gate for Python projects.
# Run from the repository root. Exits non-zero on any failure.
set -euo pipefail

echo "=== Python Quality Gate ==="

echo "[1/4] ruff format --check"
ruff format --check .

echo "[2/4] ruff check"
ruff check .

echo "[3/4] mypy --strict"
mypy . --strict

echo "[4/4] pytest --cov"
pytest --cov=src --cov-report=term-missing --tb=short

echo ""
echo "✓ All checks passed"
