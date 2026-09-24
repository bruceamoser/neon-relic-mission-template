# AGENTS.md

Guidance for AI coding agents working in repositories created from the **Neon Relic mission
template**. This repo builds a Foundry VTT v14 content module (a mission "case file") for the
[Neon Relic system](https://github.com/bruceamoser/foundry-neon-relic-system).

## Build Commands

| Command | Description |
| --- | --- |
| `npm install` | Install tooling deps (classic-level, fs-extra, js-yaml) |
| `npm run build` | Compile `src/packs/*.yaml` → `dist/packs/*` (LevelDB) + copy `static/` + `src/assets/` |
| `npm run validate` | Schema + cross-reference validation of pack sources |
| `npm run validate:self-test` | Prove the validator catches bad input (fixtures) |
| `npm run audit` | Post-build audit: manifest ↔ dist ↔ source parity, key formats, cross-links |
| `npm run scenes:verify` | Scene art guard: v14 Level entries, `background.src`, migration stamp, files in `dist/` |
| `npm run emit:uuids` | Print the slug → compendium UUID map (debugging links) |
| `./tools/push-local.sh [--link] [--no-build]` | Build + deploy to a local Foundry `Data/modules/` |

## Source of Truth

| Layer | Path | Notes |
| --- | --- | --- |
| **Pack sources** | `src/packs/*.yaml` | **Edit here.** One YAML per compendium pack |
| **Module artwork** | `src/assets/**` | Referenced as `modules/<module-id>/assets/...`; `references/` dirs never ship |
| **Static files** | `static/**` | Manifest + entry script, copied to `dist/` as-is |
| **Built output** | `dist/**` | **Generated. Never edit.** Run `npm run build` |
| **System reference** | sibling repo `foundry-neon-relic-system` | Read-only. Data models live in `src/data/` |

## Conventions

- **Slugs, not ids**: each document's `_id` is a human-readable slug; the build derives a stable
  16-char Foundry id. Cross-links use `*Slugs` fields (resolved to `*Uuids`; unknown slugs FAIL
  the build).
- **The module id comes from `static/module.json`** — tools read it at runtime. `MODULE_ID` in
  `static/scripts/main.mjs` is the one hardcoded occurrence to keep in sync.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Branch naming:
  `issue/<n>-<slug>`. Squash merges preferred.
- Version bumps: `package.json` **and** `static/module.json` together; manifests use
  `releases/latest/download/` URLs.

## Content Policy (critical)

Player-facing vs DA-only surfaces, cast-card rules (file folders, never photograph descriptions),
and the four-part DA-notes format are defined in `CONTENT-GUIDE.md` §4. **Always apply them when
touching: informationCard `content`, playerCaseBrief fields, handout journal pages, and item
descriptions** — and keep spoilers in `daNotes` / DA documents.

## Skills

- `.github/skills/create-release/SKILL.md` — full versioned-release procedure
- `.github/skills/push-local/SKILL.md` — local Foundry deploy + playtest loop

## Gotchas

- `dist/` packs are LevelDB; they must be built with `npm run build` (which compacts the database —
  hand-made edits cause phantom entries).
- Journal pages and table results compile to separate entries automatically — author nested.
- **Scenes compile to two entries**: `!scenes!<id>` plus `!scenes.levels!<id>.<levelId>` (v14 stores
  the background texture on the embedded Level). Author only `background.src` (+ optional
  `tint`/`color`/`alphaThreshold`/texture controls); never author `levels`, `initialLevel`,
  `globalLight`, `darkness` or `darknessLevel` — the validator rejects those. `pack-lib.mjs` stamps
  `_stats.coreVersion` (`SCENE_SCHEMA_CORE_VERSION = '14.353'`); without that stamp Foundry's
  `migrateLevels` migration rebuilds `levels` from the legacy top-level `background` and the scene
  imports **blank (black square) with no error**. `npm run scenes:verify` is the guard — run it after
  `npm run build`.
- **Activating a scene is the reveal** in v14: every connected client is switched to it. `navigation`
  and scene `ownership` only affect the players' own scene list, so they are never required to show
  art to players.
- **Rebuilding packs while Foundry is running serves stale data**: the server holds the pack LevelDB
  open, so new content (including re-imported scene art) appears only after Foundry restarts. When a
  world is launched, Foundry also **writes pack migrations back into `dist/packs`** (log:
  "Migrated record … of database <pack>") — rebuild before zipping a release.
- The Content Installer preserves world scene reveal state (`active`/`navigation`/`ownership`),
  remaps the pack Level onto the world's Level id, and reports `N scenes repaired` when healing
  scenes imported by older builds. Other documents are still overwritten wholesale (playtest state
  on them is reset).
- Foundry discovers new modules only at server start; content changes in the **world** require the
  Content Installer to re-run.
- **A new pack is invisible until Foundry restarts**: compendium packs are registered at server
  start, so a pack added to `static/module.json` by an update is absent from `game.packs` until the
  app is restarted. The installer detects this and warns (`N pack(s) awaiting a Foundry restart`)
  instead of skipping the pack silently — do not remove that check.
- **Playlists compile to two entry kinds**: `!playlists!<id>` plus one
  `!playlists.sounds!<id>.<soundId>` per sound (v14 stores sounds separately, like journal pages).
  Never author `seed` (non-nullable integer — `seed: null` fails validation) or `channel` (required,
  but Foundry fills `music`). Sound files must live under `src/assets/**`; the audit fails if a
  sound `path` is missing from `dist/`.
- **Audio licensing is a hard constraint**: only ship audio you may redistribute — public domain,
  CC0, CC-BY (credited in a shipped `CREDITS.md`), or ffmpeg-synthesized originals. Do NOT bundle
  Mixkit/Pixabay/other stock-library files: their licences forbid standalone redistribution, which
  is exactly what a module zip is.
- **Journal HTML can embed audio**: the sanitizer allowlist includes `audio` with
  `controls|loop|muted|src|autoplay` (and `style` globally), so `<audio controls src="modules/<id>/assets/…">`
  renders a working player in a journal page; relative paths need no scheme. Inline players are
  per-client (a DA cue) — the playlist is the synchronised, shared route. The audit checks playlist
  sound paths, not embedded players, so keep them in step with the sound `path` values.
- **Journal page ids are position-based** (`<journalId>pNNN`): only ever APPEND pages. Inserting one
  mid-journal renumbers the rest and breaks stored page UUID links (e.g. scene `journalEntryPage`).
- The module is system-locked to `neon-relic` (manifest `relationships.systems` + runtime guard in
  `main.mjs`); do not remove either.
