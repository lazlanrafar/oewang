#!/usr/bin/env python3
"""Every requirement ID in the PRD is named by a story, and is exercised.

Two checks, weakest first.

1. Named. A requirement no story names is either out of scope, and belongs
   in the non-goals, or it is a gap nobody noticed. UI-8 was the second kind
   for most of this build: every screen was written to it and
   `src/lib/url-state.ts` existed, but no story claimed it, so nothing would
   have failed if a screen had quietly stopped putting its state in the URL.

2. Exercised. Each requirement has one of: a test that cites its ID, a story
   that names it and has its "Verify in browser" box ticked, or a written
   reason in docs/reference/requirement-coverage.md for why it is not done.
   A test cites an ID by having it anywhere in the test code, comments and
   names included: a Rust tests.rs file, a tests/ directory or the part of a
   file after `#[cfg(test)]`; a Python file under apps/ai/tests; a vitest
   `*.test.ts` or a Playwright spec under apps/app.

Run it from the repository root:

    python3 scripts/coverage.py            # check (what CI runs)
    python3 scripts/coverage.py --check    # the same
    python3 scripts/coverage.py --write    # regenerate the coverage file

`--write` keeps the reasons already written in the file. A requirement that
loses its evidence is written with an empty reason, which the check rejects
until somebody writes one. Exits non-zero on any failure, so CI says so.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs/reference/requirement-coverage.md"

#: A requirement is *defined* by a row in one of the PRD's tables, which is
#: what distinguishes a definition from the hundreds of references. Any
#: prefix: a fixed list once skipped every area added after it (BUD, MCP...).
DEFINITION = re.compile(r"^\|\s*([A-Z]+-\d+)\s*\|")
REFERENCE = re.compile(r"\b[A-Z]+-\d+\b")
#: "MCP-1 to MCP-8" names all eight, as a story's requirements line does.
RANGE = re.compile(r"\b([A-Z]+)-(\d+) to \1-(\d+)\b")
STORY = re.compile(r"^### (US-\d+)", re.MULTILINE)
REASON_ROW = re.compile(r"^\|\s*([A-Z]+-\d+)\s*\|\s*not done:(.*?)\|\s*$")


def ids_in(text: str) -> set[str]:
    found = set(REFERENCE.findall(text))
    for prefix, low, high in RANGE.findall(text):
        found.update(f"{prefix}-{n}" for n in range(int(low), int(high) + 1))
    return found


def order(requirement: str) -> tuple[str, int]:
    prefix, number = requirement.split("-")
    return prefix, int(number)


def test_sources() -> dict[str, str]:
    """Relative path -> the test part of the file."""
    sources: dict[str, str] = {}
    for path in (ROOT / "apps/api").rglob("*.rs"):
        if "target" in path.parts:
            continue
        text = path.read_text()
        if path.name.endswith("tests.rs") or "tests" in path.parts:
            sources[str(path.relative_to(ROOT))] = text
        elif "#[cfg(test)]" in text:
            sources[str(path.relative_to(ROOT))] = text.split("#[cfg(test)]", 1)[1]
    for pattern in (
        "apps/ai/tests/**/*.py",
        "apps/app/src/**/*.test.ts",
        "apps/app/e2e/**/*.spec.ts",
        "apps/native/test/**/*.dart",
        "apps/native/integration_test/**/*.dart",
    ):
        for path in ROOT.glob(pattern):
            if "node_modules" not in path.parts:
                sources[str(path.relative_to(ROOT))] = path.read_text()
    return sources


def browser_verified(backlog: str) -> dict[str, list[str]]:
    """Requirement -> stories that name it and have "Verify in browser" ticked."""
    verified: dict[str, list[str]] = {}
    parts = STORY.split(backlog)[1:]
    for story, body in zip(parts[::2], parts[1::2]):
        if "- [x] Verify in browser" not in body:
            continue
        line = next((l for l in body.splitlines() if l.startswith("Requirements:")), "")
        for requirement in ids_in(line):
            verified.setdefault(requirement, []).append(story)
    return verified


def written_reasons() -> dict[str, str]:
    if not OUTPUT.exists():
        return {}
    return {
        match.group(1): match.group(2).strip()
        for line in OUTPUT.read_text().splitlines()
        if (match := REASON_ROW.match(line))
    }


def render(defined: list[str]) -> tuple[str, list[str]]:
    """The file, and the requirements with no evidence and no reason."""
    cited: dict[str, list[str]] = {}
    for path, text in sorted(test_sources().items()):
        for requirement in ids_in(text):
            cited.setdefault(requirement, []).append(path)
    verified = browser_verified((ROOT / "docs/backlog.md").read_text())
    reasons = written_reasons()

    rows, unaccounted = [], []
    counts = {"test": 0, "browser": 0, "not done": 0}
    for requirement in defined:
        if requirement in cited:
            counts["test"] += 1
            evidence = ", ".join(f"`{path}`" for path in cited[requirement])
        elif requirement in verified:
            counts["browser"] += 1
            evidence = "verified in browser by " + ", ".join(sorted(verified[requirement]))
        else:
            counts["not done"] += 1
            reason = reasons.get(requirement, "")
            if not reason:
                unaccounted.append(requirement)
            evidence = f"not done: {reason}"
        rows.append(f"| {requirement} | {evidence} |")

    text = "\n".join(
        [
            "# Requirement coverage",
            "",
            "How each requirement in the [PRD](../prd.md#6-requirements) is shown to work.",
            "",
            "**Generated by `scripts/coverage.py --write`. Edit only the reasons after",
            '"not done:"; the script keeps them and rewrites everything else.** CI runs',
            "the script and fails when this file is stale or when a requirement has no",
            "test, no browser-verified story and no reason.",
            "",
            "Evidence is, in order of preference: a test file that cites the ID (in a",
            'name or a comment); a backlog story that names the ID and has its "Verify',
            'in browser" box ticked; or a written reason it is not done.',
            "",
            f"- {counts['test']} with test evidence",
            f"- {counts['browser']} verified in browser only",
            f"- {counts['not done']} not done",
            "",
            "| ID | Evidence |",
            "|---|---|",
            *rows,
            "",
        ]
    )
    return text, unaccounted


def main() -> int:
    prd = (ROOT / "docs/prd.md").read_text()
    defined = sorted(
        {match.group(1) for line in prd.splitlines() if (match := DEFINITION.match(line))},
        key=order,
    )

    backlog = (ROOT / "docs/backlog.md").read_text()
    missing = sorted(set(defined) - ids_in(backlog), key=order)
    if missing:
        print(f"{len(missing)} requirement(s) no story names:")
        for requirement in missing:
            print(f"  {requirement}")
        return 1
    print(f"all {len(defined)} requirements are named by a story")

    rendered, unaccounted = render(defined)
    if "--write" in sys.argv:
        OUTPUT.write_text(rendered)
        print(f"wrote {OUTPUT.relative_to(ROOT)}")

    if unaccounted:
        print(f"{len(unaccounted)} requirement(s) with no test, no browser story and no reason:")
        for requirement in unaccounted:
            print(f"  {requirement}")
        return 1
    if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
        print(f"{OUTPUT.relative_to(ROOT)} is stale; run scripts/coverage.py --write")
        return 1
    print(f"all {len(defined)} requirements have a test, a browser story or a reason")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
