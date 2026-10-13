"""Checks the Unraid template and ca_profile.xml are ready for Community Applications.

Run from the repository root: python3 scripts/check-unraid.py
"""

import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = "https://raw.githubusercontent.com/matthewcarberry/fixit/main/"
errors: list[str] = []


def text(el: ET.Element, tag: str) -> str:
    found = el.find(tag)
    return (found.text or "").strip() if found is not None else ""


def raw_file_exists(url: str, what: str) -> None:
    if not url.startswith(RAW):
        errors.append(f"{what} should be a raw GitHub URL on main, got {url!r}")
    elif not (ROOT / url[len(RAW):]).is_file():
        errors.append(f"{what} points at {url[len(RAW):]}, which isn't in the repository")


template = ET.parse(ROOT / "unraid/fixit.xml").getroot()
for tag in ["Name", "Repository", "Registry", "Overview", "Category", "Icon", "Project", "Support", "TemplateURL", "WebUI"]:
    if not text(template, tag):
        errors.append(f"unraid/fixit.xml is missing <{tag}>")
raw_file_exists(text(template, "TemplateURL"), "<TemplateURL>")
raw_file_exists(text(template, "Icon"), "<Icon>")

# Every setting the template offers must be one the container actually reads.
known = set(re.findall(r'"([A-Z][A-Z0-9_]+)"', (ROOT / "apps/server/src/config.ts").read_text()))
known |= set(re.findall(r"\b(PUID|PGID)\b", (ROOT / "docker/entrypoint.sh").read_text()))
known |= {"TZ"}
exposed = set(re.findall(r"^EXPOSE (\d+)", (ROOT / "Dockerfile").read_text(), re.M))
for config in template.findall("Config"):
    target, kind = config.get("Target", ""), config.get("Type")
    if kind == "Variable" and target not in known:
        errors.append(f"template variable {target} isn't read by the server or entrypoint")
    if kind == "Port" and target not in exposed:
        errors.append(f"template port {target} isn't EXPOSEd in the Dockerfile")

profile = ET.parse(ROOT / "ca_profile.xml").getroot()
if profile.tag != "CommunityApplications" or not text(profile, "Profile"):
    errors.append("ca_profile.xml needs a non-empty <Profile> inside <CommunityApplications>")
if text(profile, "Icon"):
    raw_file_exists(text(profile, "Icon"), "ca_profile.xml <Icon>")

for error in errors:
    print(f"error: {error}")
if errors:
    sys.exit(1)
print("Unraid template and ca_profile.xml look good")
