# Neon Relic — Mission Module Template

Foundry VTT v14 content-module scaffolding for building **mission case files** for the
[**Neon Relic** system](https://github.com/bruceamoser/foundry-neon-relic-system).

This repository is a working, installable module — not just a skeleton. It ships example content
for every document type a mission uses, the complete build/test/release tooling, and a
[Content Guide](CONTENT-GUIDE.md) that documents how each piece fits into a case file.

> **Full-scale reference implementation:** [neon-relic-mission-sangreal-foundry](https://github.com/bruceamoser/neon-relic-mission-sangreal-foundry)
> (*Mission: Sangreal*) is a complete published mission built on this exact tooling — 61 information
> cards, 16 cast members, a 14-day case board, journals with a DA walkthrough, and illustrated
> artwork. When in doubt, look at how Sangreal does it.

---

## What you get

| Bundle | Contents |
| --- | --- |
| **Build pipeline** | `src/packs/*.yaml` → Foundry v14 LevelDB compendium packs + static copy → `dist/` |
| **Quality gates** | `npm run validate` (schema checks), `npm run audit` (manifest ↔ build parity, key formats, cross-link integrity) and `npm run scenes:verify` (scene Levels, art files, migration stamp) |
| **Content installer** | A module settings menu that imports all packs into a world with per-pack folders, overwrite-by-id updates, automatic landing-scene activation, and scene-art repair on older imports |
| **Scene art ready** | Landing splash page + theater-of-the-mind/battle-map scenes authored as YAML and compiled onto Foundry v14 **Level** documents, so artwork survives import |
| **Sound effects ready** | A `Sound Effects` Playlist pack — ambience beds, props and stings compiled from YAML, checked against `dist/` by the audit, and licensed for redistribution |
| **Spoiler lock** | All packs ship GM-only (`"ownership": { "PLAYER": "NONE" }`) so players cannot browse DA briefs or walkthroughs from their sidebar — world copies you reveal still reach them |
| **System guard** | The module is inert outside the **neon-relic** system and warns the GM if wrongly enabled |
| **Local testing** | `tools/push-local.sh` — build and deploy to a local Foundry install (rsync or symlink mode) |
| **Release automation** | `.github/workflows/release.yml` + the `create-release` skill: versioned GitHub releases with the module zip and manifest attached |
| **Example content** | 18 documents across 8 packs showing every mission document type (see `src/packs/`) |
| **Documentation** | This README, the [Content Guide](CONTENT-GUIDE.md), and agent skills in `.github/skills/` |

---

## Requirements

- **Foundry VTT v14**
- **Neon Relic system ≥ 0.11.1** — install it first:
  `https://github.com/bruceamoser/foundry-neon-relic-system/releases/latest/download/system.json`
- **Node.js ≥ 20** (for the build tooling)

No Node? You can still author everything and let the GitHub release workflow build it for you —
but local `build`/`validate`/`audit` are strongly recommended before you push.

---

## Quick start

### 1. Create your repo

Click **Use this template** on GitHub (recommended — starts fresh history), or:

```bash
git clone <this-repo-url> my-mission
cd my-mission
git remote set-url origin <your-repo-url>
```

### 2. Rename the module

Search for `neon-relic-mission-template` and update every occurrence:

| File | What to change |
| --- | --- |
| `static/module.json` | `id` (your module id, e.g. `my-mission`), `title`, `description`, `authors`, `version` (start at `0.1.0`), `url`/`bugs`/`changelog`, and the `manifest`/`download` URLs → **your** repo's `releases/latest/download/...` |
| `static/scripts/main.mjs` | `MODULE_ID` at the top |
| `src/packs/example-sfx.yaml` | Playlist packs: looping beds vs one-shot stings, and the licensing rule for audio |
| `src/packs/example-scenes.yaml` | The `flags` namespace (`neon-relic-mission-template:` → your id) and the background `src` path |
| Any pack YAML `img:` paths | `modules/<your-module-id>/assets/...` |
| `package.json` | `name`, `description` |

Everything else (build, audit, installer folders, release workflow) derives the id from
`static/module.json` at runtime.

### 3. Build and check

```bash
npm install
npm run build        # compiles src/packs/*.yaml + static/ + src/assets/ → dist/
npm run validate     # schema + cross-reference checks on your YAML
npm run audit        # manifest ↔ build parity, LevelDB key formats, link integrity
npm run scenes:verify # scene Levels, background files, migration stamp
```

### 4. Test locally in Foundry (optional — needs a local install)

```bash
./tools/push-local.sh          # build + deploy to your Foundry modules/ folder
./tools/push-local.sh --link   # one-time symlink; after that just: npm run build
```

Then: **restart Foundry** (first install only), create/launch a test world on the neon-relic
system, enable the module in **Manage Modules**, and run **Configure Settings → Module Settings →
&lt;your module&gt; → Content Installer**. See [Testing locally](#testing-locally-in-foundry).

### 5. Build your mission

Replace the example packs with your own content. The [Content Guide](CONTENT-GUIDE.md) documents
every document type, its fields, and — critically — the **player-facing vs DA-only content rules**
that this project holds authors to. Sound effects (§3.14) follow one hard rule: only ship audio you
may redistribute (public domain, CC0, CC-BY with credit, or your own ffmpeg-generated tracks).

### 6. Release

Bump the version, tag, and publish:

```bash
# version bump in package.json + static/module.json, then:
npm run build
git add -A && git commit -m "chore: bump version to 0.2.0" && git push
git tag -a v0.2.0 -m "v0.2.0" && git push origin v0.2.0
(cd dist && zip -qr ../<your-module-id>.zip .)
gh release create v0.2.0 --title "v0.2.0" --generate-notes \
  ./<your-module-id>.zip ./dist/module.json
```

The `create-release` skill (`.github/skills/create-release/SKILL.md`) walks the full procedure
with pre-flight checks. After you publish, the repo's **Release CI** workflow revalidates the tag,
rebuilds, and re-attaches `module.json` (and the zip, if missing).

---

## Repository layout

```
├── src/
│   ├── packs/            # One YAML file per compendium pack — THIS is where you author
│   └── assets/           # Module artwork; anything under a "references/" dir is never shipped
├── static/               # Copied to dist/ as-is
│   ├── module.json       # Module manifest (id, packs, compatibility, relationships)
│   └── scripts/main.mjs  # System guard + Content Installer (derives everything from the manifest)
├── tools/
│   ├── build.mjs         # YAML → LevelDB packs + static copy → dist/
│   ├── validate-packs.mjs# Schema/constraint validation (with --self-test fixtures)
│   ├── audit-build.mjs   # Post-build audit: manifest ↔ dist ↔ source parity, cross-links
│   ├── emit-uuids.mjs    # Print the slug → compendium UUID map
│   ├── push-local.sh     # Build + deploy to a local Foundry modules/ folder
│   └── lib/pack-lib.mjs  # The pack compiler (Foundry v14 LevelDB format)
└── .github/
    ├── workflows/release.yml      # Revalidates + re-attaches release artifacts on publish
    └── skills/                    # Agent workflow skills (create-release, push-local)
```

**`dist/` is generated. Never edit it by hand** — always `npm run build`.

---

## Authoring in 60 seconds

Each pack is one YAML file; each document needs `_id` (your authoring slug), `name`, `type`, and a
`system:` block. The build converts slugs into deterministic 16-char Foundry ids, so **compendium
ids stay stable across builds** — links from your world content never break on re-import.

Cross-reference other documents by slug; the build resolves them to UUIDs and **fails on typos**:

```yaml
- _id: my-npc-villain
  name: 'The Villain'
  type: npc
  system:
    tier: 3
    startingKnowledgeSlugs: [my-ic03]   # → compiled into startingKnowledgeUuids
```

Slug fields available: `npcSlugs`, `locationSlugs`, `organizationSlugs`, `informationCardSlugs`,
`foundAtSlugs`, `knownBySlugs`, `startingKnowledgeSlugs`, `gainedKnowledgeSlugs` — plus `orgSlug`
on each case-board track. Full field tables: [Content Guide](CONTENT-GUIDE.md).

Other useful commands:

| Command | What it does |
| --- | --- |
| `npm run clean` | Remove `dist/` |
| `npm run scenes:verify` | Prove scene art is import-safe (v14 Levels, migration stamp, files present) |
| `npm run emit:uuids` | Print every document's slug → compendium UUID (for debugging links) |
| `npm run validate:self-test` | Prove the validator still catches bad input (7 fixtures) |

---

## Scene art

Scenes are how your module puts art on the players' screen. You author one YAML document; the build
compiles the image onto a Foundry v14 **Level** (the place v14 actually stores a scene background)
and stamps `_stats.coreVersion` so Foundry's migrations leave it alone:

```yaml
- _id: my-scene-ex1
  name: 'EX1 — Atmosphere view'
  type: scene
  navName: 'EX1'
  navigation: false          # keep out of the players' scene list
  background:
    src: modules/<your-module-id>/assets/scenes/ex1.webp
  width: 1672
  height: 941
  grid: { type: 0, size: 100 }  # gridless
  flags:
    <your-module-id>:
      sceneArtId: EX1
```

Rules that keep art from disappearing:

- **Never** author `levels`, `initialLevel`, `globalLight`, `darkness` or `darknessLevel` — the
  validator rejects them. A legacy top-level `background` makes Foundry rebuild the Level on import
  and the scene imports as a blank black square, silently.
- Export WebP at q82–85 and keep masters **out of the repo** (only `src/assets/**` ships; add master
  folders to `art/.gitignore`, which already ignores `scene-production/masters/`).
- Run `npm run scenes:verify` after every build — it is the guard that the stamp, the Level and the
  image file all survived.

Revealing at the table: **activating a scene is the reveal** — every connected player is switched to
it, no permission or Accessibility change needed. `navigation` / Accessibility only control whether
players can re-open the scene themselves from their own scene list. Re-running the Content Installer
never undoes this: it preserves each world scene's `active` / `navigation` / `ownership` and reports
`N scenes repaired` when it restores art on scenes imported by older builds.

---

## Testing locally in Foundry

If you have Foundry installed on this machine:

1. **Point the tooling at your Foundry data folder** (optional — the default is
   `~/.local/share/FoundryVTT`):

   ```bash
   echo "$HOME/.local/share/FoundryVTT" > pathconfig    # gitignored
   ```

   Or set `FOUNDRY_DATA`. The script reads `pathconfig` first.

2. **Deploy** — `./tools/push-local.sh` builds and rsyncs `dist/` into
   `Data/modules/<your-module-id>/`. For iterative work use `--link` once, then just
   `npm run build` after each change.

3. **Discover** — Foundry scans for new modules at **server start**. Restart Foundry once.
   After that, a world reload (F5) picks up changes.

4. **Use it** — launch a world on the **neon-relic** system → **Manage Modules** → enable your
   module → **Configure Settings → Module Settings → your module → Content Installer**. Your packs
   import into a folder tree named after the module, one subfolder per pack label.

5. **Iterate** — `npm run build` → F5 → re-run the Content Installer (it overwrites by id; no
   duplicates). Note the installer replaces world copies of documents, which **resets playtest
   state** stored on them (board day markers, checkboxes) — scene reveal state
   (`active` / `navigation` / `ownership`) is preserved instead, and art-less scenes from older
   builds are repaired.

> Rebuilding `dist/packs` while Foundry is running serves **stale pack data** (the server keeps the
> LevelDB files open): quit and relaunch Foundry before verifying content changes, then re-run the
> Content Installer.

> `npm run build && npm run validate && npm run audit` passing is the same gate CI enforces —
> you can develop confidently without a local Foundry.

---

## Releasing

The manifest URL baked into your module is **stable forever**:

```
https://github.com/<you>/<repo>/releases/latest/download/module.json
```

so installers auto-update. A release is: bump `version` in `package.json` + `static/module.json`,
commit on `main`, tag `vX.Y.Z`, attach `<module-id>.zip` + `dist/module.json` to a GitHub release.
The included workflow then revalidates and re-attaches artifacts automatically. Full procedure
(including the pre-flight checklist): `.github/skills/create-release/SKILL.md`.

**End-user install:** Foundry Setup → **Game Systems → Install System** (neon-relic URL above) →
**Add-on Modules → Install Module → Manifest URL** → your `releases/latest/download/module.json`.
Then enable in a world and run the Content Installer.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Module missing in Foundry after deploy | New modules are only discovered at **server start** — restart Foundry. Check the folder exists: `Data/modules/<your-id>/module.json`. |
| World still shows old content after a build | The compendium reflects disk immediately, but **world copies** update only via the Content Installer. |
| `unresolved slug "..."` build error | A `*Slugs` cross-reference names a `_id` that doesn't exist (yet). Fix the slug or create the document. |
| Cards/journal show phantom empty pages | You hand-edited `dist/` or skipped `compactRange` — always rebuild with `npm run build`. |
| Imported scene is an **empty black square** | The pack scene lost its v14 Level — usually a record without `_stats.coreVersion`, or a legacy top-level `background` making `migrateLevels` rebuild it. Rebuild with `npm run build` (the compiler stamps the gate), restart Foundry, re-run the Content Installer: it repairs existing world scenes and reports `N scenes repaired`. |
| Scene art missing for players, GM sees it | They are looking at the canvas of a different scene: activating a scene pulls every client to it. Accessibility/`navigation` only add it to their own scene list. |
| Playlist track is silent | The sound `path` doesn't resolve. `npm run audit` fails on this — if you edited `dist/` by hand instead of rebuilding, the file isn't there. |
| Module warns "requires neon-relic" in another system world | Working as intended: the module is system-locked (manifest `relationships.systems` + runtime guard). |
| Foundry lists the module but won't enable it | The world's neon-relic system version is below the `compatibility.minimum` in `static/module.json`. |

---

## Reference

- **[Neon Relic system repo](https://github.com/bruceamoser/foundry-neon-relic-system)** — document
  data models (`src/data/`), sheets, and the engine this module targets. The source of truth for
  every field name used in pack YAML.
- **[Mission: Sangreal](https://github.com/bruceamoser/neon-relic-mission-sangreal-foundry)** —
  complete published mission built from this template's tooling.
- **[Content Guide](CONTENT-GUIDE.md)** — document-type recipes and the content policy.
- **Skills** — `.github/skills/create-release/` and `.github/skills/push-local/` contain the
  step-by-step procedures used for this repo (usable by the team and by AI coding agents).

## License

MIT (see `package.json`). Replace with your own license before publishing your mission.
