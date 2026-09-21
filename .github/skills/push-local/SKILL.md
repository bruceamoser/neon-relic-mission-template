---
name: push-local
description: 'Build and push this Neon Relic mission module to a local Foundry VTT instance for testing. USE FOR: "push local", "deploy local", "push to foundry", "test locally", "update local foundry", "push to local instance".'
user-invocable: true
---

# Push Local — Neon Relic Mission Module

Build the module and deploy it to a local Foundry VTT installation for immediate playtesting.

## Prerequisites

- Working directory: this repository's root
- Local Foundry VTT installed and able to run a world on the **neon-relic** system
- Foundry user data folder known — default: `~/.local/share/FoundryVTT` (Linux)
- Build output: `dist/` → target: `Data/modules/<module-id>/` (id from `static/module.json`)

## Two Approaches

### Option A — Symlink (recommended, one-time setup)

Foundry reads directly from `dist/`. After the initial setup you only need `npm run build` +
a world reload (F5).

```bash
./tools/push-local.sh --link
# Then every change cycle:
npm run build
# Reload the Foundry world (F5)
```

### Option B — Direct Copy (every push)

```bash
./tools/push-local.sh            # builds + rsyncs dist/ into Foundry modules/
./tools/push-local.sh --no-build # deploy the existing dist/ without rebuilding
```

The script:

1. Reads the module id from `static/module.json` (nothing is hardcoded)
2. Resolves the Foundry data path: `pathconfig` file → `$FOUNDRY_DATA` → default
3. Runs `npm run build` (unless `--no-build`)
4. Syncs `dist/` → `Data/modules/<module-id>/` via `rsync --delete`

**Point the script at your data folder** (one-time, gitignored):

```bash
echo "$HOME/.local/share/FoundryVTT" > pathconfig
```

## Workflow

### Step 1 — Build & Push

```bash
npm run validate && npm run build && ./tools/push-local.sh --no-build
```

### Step 2 — First install only: restart Foundry

Foundry discovers **new** modules at server start. If the module has never been installed, restart
Foundry entirely (not just the world).

### Step 3 — Enable & Import

1. Launch a test world running the **neon-relic** system
2. **Manage Modules** → enable this module → save (world reloads)
3. **Configure Settings → Module Settings → this module → Content Installer** → Import / Update
   Content
4. Content appears in a folder tree named after the module, one subfolder per pack; the landing
   scene activates if the world has no active scene

### Step 4 — Iterate

```bash
npm run build        # (symlink mode) — then F5 in Foundry
```

- **Compendium packs** reflect disk changes on world load
- **World copies** of documents update only when you re-run the Content Installer
- Re-running the installer **resets playtest state** on documents it overwrites (board day
  markers, checkboxes) — warn testers if a session is mid-flight

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Module not in Manage Modules | Restart Foundry; verify `Data/modules/<id>/module.json` exists |
| `dist/` missing | Run `npm run build` (or drop `--no-build`) |
| Wrong data path | Check `pathconfig` or `FOUNDRY_DATA`; re-run |
| Changes not visible | F5 the world; if packs changed, also re-run the Content Installer for world copies |
| Module shows as disabled in the world | The world's neon-relic system version is below the manifest's system `compatibility.minimum` — update the system |
