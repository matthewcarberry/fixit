"""Works out the next release version for the Release workflow.

Run from the repository root:
  python3 scripts/next-version.py LATEST_TAG LABEL...

LATEST_TAG is the newest vX.Y.Z tag (or "" when there is none). The labels are
the merged pull request's labels. Prints the new tag, like v0.3.1, or nothing
when the pull request has release:skip.

  release:major  0.3.0 -> 1.0.0
  release:minor  0.3.0 -> 0.4.0
  no label       0.3.0 -> 0.3.1
  release:skip   no release
"""

import re
import sys

VERSION = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def next_version(latest, labels):
    if "release:skip" in labels:
        return None
    match = VERSION.match(latest or "v0.0.0")
    if not match:
        raise ValueError(f"{latest!r} isn't a version like v1.2.3")
    major, minor, patch = (int(part) for part in match.groups())
    if "release:major" in labels:
        return f"v{major + 1}.0.0"
    if "release:minor" in labels:
        return f"v{major}.{minor + 1}.0"
    return f"v{major}.{minor}.{patch + 1}"


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    print(next_version(argv[1], set(argv[2:])) or "")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
