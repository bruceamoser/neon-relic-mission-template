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
- Foundry discovers new modules only at server start; content changes in the **world** require the
  Content Installer to re-run.
- The module is system-locked to `neon-relic` (manifest `relationships.systems` + runtime guard in
  `main.mjs`); do not remove either.
