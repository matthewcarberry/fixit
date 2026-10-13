"""Reads release information from CHANGELOG.md for the Release workflow.

Run from the repository root:
  python3 scripts/changelog.py version        prints the top section's version (like 0.3.0),
                                               or nothing while the top section is "Unreleased"
  python3 scripts/changelog.py notes 0.3.0    prints that version's section, for the release notes
"""

import re
import sys
from pathlib import Path

HEADING = re.compile(r"^## +(.+?)\s*$")
VERSION = re.compile(r"^v?(\d+\.\d+\.\d+)$")


def sections(text):
    """Yields (heading, body) for each "## " section, top first."""
    heading, body = None, []
    for line in text.splitlines():
        match = HEADING.match(line)
        if match:
            if heading is not None:
                yield heading, "\n".join(body).strip()
            heading, body = match.group(1), []
        elif heading is not None:
            body.append(line)
    if heading is not None:
        yield heading, "\n".join(body).strip()


def top_version(text):
    for heading, _ in sections(text):
        match = VERSION.match(heading)
        return match.group(1) if match else None
    return None


def notes(text, version):
    for heading, body in sections(text):
        match = VERSION.match(heading)
        if match and match.group(1) == version:
            return body
    return None


def main(argv):
    text = Path("CHANGELOG.md").read_text(encoding="utf-8")
    if argv[1:] == ["version"]:
        print(top_version(text) or "")
        return 0
    if len(argv) == 3 and argv[1] == "notes":
        body = notes(text, argv[2].lstrip("v"))
        if body is None:
            print(f"CHANGELOG.md has no section for {argv[2]}", file=sys.stderr)
            return 1
        print(body)
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
