---
name: create-release
description: 'Create a versioned GitHub release for this Neon Relic mission module. Semver bump (major/minor/patch), pre-flight checks, build, tag, and publish. USE FOR: "create release", "make release", "publish release", "cut release", "ship it", "bump version and release".'
argument-hint: '<major|minor|patch>'
user-invocable: true
---

# Create Release — Neon Relic Mission Module

Complete end-to-end workflow for cutting a versioned GitHub release of a mission module built from
this template. This skill IS the procedure — follow every step, in order, without skipping.

## Prerequisites

- Working directory: this repository's root
- Tag format: `v<major>.<minor>.<patch>` (e.g., `v0.2.0`)
- Release artifacts: `<module-id>.zip` + `module.json` (the module id comes from
  `static/module.json`)
- `gh` CLI authenticated with `repo` scope
- Node.js 20+ and npm available

> The repository carries `.github/workflows/release.yml`. It runs when a release is **published**
> and rebuilds/validates from a clean checkout. It re-attaches `module.json` always and the zip
> only when missing — publishing with assets already attached is safe and fast.

## Parameter: `<type>`

One of:

- `major` — breaking changes (x.0.0)
- `minor` — new features/content, backwards-compatible (0.x.0)
- `patch` — bug fixes/content corrections (0.0.x)

## URI Convention

The source-of-truth `static/module.json` MUST keep URIs pointing to `latest`:

```json
"manifest": "https://github.com/<owner>/<repo>/releases/latest/download/module.json",
"download": "https://github.com/<owner>/<repo>/releases/latest/download/<module-id>.zip"
```

The `manifest` always resolves to the latest release's `module.json`, and `download` always fetches
the latest zip. Do NOT replace these with version-specific URLs in source; the version-specific URL
is set only at release time via the release assets.

## Mandatory 6-Step Workflow

### Step 1 — Pre-Flight Checks

All of these MUST pass before proceeding:

```bash
# 1a. On main, fully up to date
git checkout main
git pull origin main
git status              # MUST show "nothing to commit, working tree clean"

# 1b. No open PRs against main
gh pr list --base main --state open --json number,title
# MUST return [] (empty). If any open PRs exist, stop and resolve them first.

# 1c. Pack sources validate
npm run validate

# 1d. Build succeeds
npm run build
```

If any check fails, stop and fix it before continuing.

### Step 2 — Compute & Bump Version

Read the current version and compute the new one:

```bash
CURRENT=$(node -p "require('./static/module.json').version")
echo "Current version: $CURRENT"

# Compute NEW_VERSION from CURRENT and the bump type, then write it to BOTH:
#   - package.json          "version"
#   - static/module.json    "version"
```

Verify URIs still point to `latest`:

```bash
grep '"manifest"' static/module.json | grep 'latest/download'
grep '"download"' static/module.json | grep 'latest/download'
```

Both MUST contain `latest/download`.

> Convention: the bump may ship inside the fix PR that precedes the release (tags then sit directly
> on merge commits), or as a standalone `chore: bump version to X.Y.Z` commit on `main`. Either is
> fine — but the version must be committed to `main` before tagging.

### Step 3 — Build & Commit

```bash
npm run build                 # ensure dist/ reflects the bumped manifest
npm run audit                 # sanity: manifest ↔ build parity

# If the bump is not already committed:
git add package.json static/module.json
git commit -m "chore: bump version to $NEW_VERSION"
git push origin main
```

### Step 4 — Create Git Tag & GitHub Release

```bash
git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"
git push origin "v${NEW_VERSION}"
```

Create the GitHub release with auto-generated notes and attach the artifacts:

```bash
# Create the ZIP artifact from dist/
MODULE_ID=$(node -p "require('./dist/module.json').id")
(cd dist && zip -r "../${MODULE_ID}.zip" .)

gh release create "v${NEW_VERSION}" \
  --title "v${NEW_VERSION}" \
  --generate-notes \
  --prerelease=false \
  "./${MODULE_ID}.zip" ./dist/module.json
```

**What this does:**

- Creates a GitHub Release tagged `v${NEW_VERSION}` (Foundry uses the tag to detect updates)
- Generates release notes from merged PRs since the last release
- Uploads the zip (full module) and `module.json` (manifest) as release assets
- Foundry resolves `.../latest/download/module.json` → this release's manifest

For very large zips (100 MB+), `gh release create` with assets can wedge on upload. If that
happens, create the release body-only (`gh release create <tag> --generate-notes --draft`), upload
with retries (`gh release upload <tag> ./zip --clobber`), then publish
(`gh release edit <tag> --draft=false`).

### Step 5 — Verify

```bash
# 5a. Confirm the release exists and is not a prerelease
gh release view "v${NEW_VERSION}" --json tagName,publishedAt,isPrerelease

# 5b. Confirm both assets are attached
gh release view "v${NEW_VERSION}" --json assets --jq '.assets[] | "\(.name) — \(.size) bytes"'

# 5c. Verify the manifest is downloadable and its version matches
curl -sL "https://github.com/<owner>/<repo>/releases/download/v${NEW_VERSION}/module.json" \
  | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version"
# MUST output: ${NEW_VERSION}

# 5d. Verify the latest manifest resolves to this release
curl -sL "https://github.com/<owner>/<repo>/releases/latest/download/module.json" \
  | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).version"

# 5e. Clean up the local zip
rm -f "${MODULE_ID}.zip"
```

### Step 6 — Confirm & Clean Up

```bash
git status                    # clean, on main
git branch -a                 # no stale branches
gh release list --limit 3     # new release at the top

# Optional: confirm the CI run on the tag went green
gh run list --limit 3
```

Optionally deploy the release locally to spot-check (`./tools/push-local.sh`) — see the
`push-local` skill.

## Install in Foundry VTT

After the release, end users install from the stable manifest URL:

1. **Setup → Add-on Modules → Install Module → Manifest URL**:

   `https://github.com/<owner>/<repo>/releases/latest/download/module.json`

2. The **neon-relic** system must be installed first
   (`https://github.com/bruceamoser/foundry-neon-relic-system/releases/latest/download/system.json`).

3. Enable the module in a world, then run the **Content Installer**
   (Configure Settings → Module Settings → this module) to import the mission content.
