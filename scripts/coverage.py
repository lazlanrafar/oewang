#!/usr/bin/env python3
"""Every requirement ID in the PRD should be named by a backlog story.

A requirement no story names is either out of scope, and belongs in the
non-goals, or it is a gap nobody noticed. UI-8 was the second kind for most
of this build: every screen was written to it and `src/lib/url-state.ts`
existed, but no story claimed it, so nothing would have failed if a screen
had quietly stopped putting its state in the URL.

Exits non-zero when a requirement is unnamed, so CI says so.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: A requirement is *defined* by a row in one of the PRD's tables, which is
#: what distinguishes a definition from the hundreds of references. Any
#: prefix: a fixed list once skipped every area added after it (BUD, MCP...).
DEFINITION = re.compile(r"^\|\s*([A-Z]+-\d+)\s*\|")
REFERENCE = re.compile(r"[A-Z]+-\d+")
#: "MCP-1 to MCP-8" names all eight, as a story's requirements line does.
RANGE = re.compile(r"\b([A-Z]+)-(\d+) to \1-(\d+)\b")


def main() -> int:
    prd = (ROOT / "docs/prd.md").read_text()
    defined = {
        match.group(1)
        for line in prd.splitlines()
        if (match := DEFINITION.match(line))
    }

    backlog = (ROOT / "docs/backlog.md").read_text()
    named = set(REFERENCE.findall(backlog))
    for prefix, low, high in RANGE.findall(backlog):
        named.update(f"{prefix}-{n}" for n in range(int(low), int(high) + 1))
    missing = sorted(
        defined - named, key=lambda id: (id.split("-")[0], int(id.split("-")[1]))
    )

    if missing:
        print(f"{len(missing)} requirement(s) no story names:")
        for requirement in missing:
            print(f"  {requirement}")
        return 1

    print(f"all {len(defined)} requirements are named by a story")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
