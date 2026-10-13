# Repository rulesets

These JSON files are the GitHub rulesets for this repo, kept here so they're
versioned and easy to restore. GitHub doesn't apply them from the repo on its
own: import each one under **Settings → Rules → Rulesets → New ruleset →
Import a ruleset**.

## protect-main.json

Applies to the default branch (`main`).

- Changes land through a pull request; direct pushes, force-pushes and
  deleting the branch are blocked.
- The CI jobs `test` and `docker` (from `.github/workflows/ci.yml`) must pass.
- No approving review is required, so a solo maintainer can merge their own
  PRs. Review threads must be resolved before merging.
- Squash merges only, which keeps `main` history linear.
- Repository admins can bypass the rules when merging a pull request (for
  example, to merge while CI is down), but not to push straight to `main`.

## protect-release-tags.json

Applies to `v*` tags, which trigger `.github/workflows/release.yml`.

- Anyone with write access can create a release tag as usual.
- Once pushed, a release tag can't be moved or deleted, so a published image
  always matches its tag.
- Repository admins can bypass this to fix a bad tag.
