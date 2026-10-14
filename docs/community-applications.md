# Publishing to Unraid Community Applications

Fixit is set up so any release can be listed in Community Applications (CA). The pieces CA reads live in this repository:

- `unraid/fixit.xml`, the Docker template people install from
- `ca_profile.xml`, the maintainer profile CA shows for this repository
- `LICENSE` (MIT) at the repository root
- the image `ghcr.io/matthewcarberry/fixit`, published by the Release workflow for each release (see Releases in the README)

CI runs `python3 scripts/check-unraid.py` on every pull request. It fails if the template loses a field CA needs, points its icon or template URL at a file that doesn't exist, offers a setting the server doesn't read, or maps a port the image doesn't expose.

## Submitting (once, by the repository owner)

1. Make sure the latest release image is public: on GitHub, open Packages, then `fixit`, then Package settings, and check the visibility is Public.
2. Sign in at [ca.unraid.net/submit/new](https://ca.unraid.net/submit/new) and enter `https://github.com/matthewcarberry/fixit`.
3. Run **Validate** and **Scan**. Fix anything they flag in this repository, merge, and run them again.
4. Submit for review.
5. Optional: start a support thread on the [Unraid forums](https://forums.unraid.net/) and add its address as `<Forum>` in `ca_profile.xml` and `<Support>` in the template. Until then, support points at GitHub issues.

## After it is listed

CA re-reads the template from `main`, so changes to `unraid/fixit.xml` reach users without a new submission. Keep these true for every release:

- New settings get a `<Config>` entry with a sensible default, and existing `Target` names never change, so people's saved settings keep working.
- The `latest` tag always points at the newest release.
- Each GitHub release says what changed; the template's `<Changes>` links to the Releases page.
