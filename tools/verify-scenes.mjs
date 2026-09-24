#!/usr/bin/env node
/**
 * Mission template — scene integration check.
 *
 * Verifies that the compiled Scene packs carry artwork that Foundry can
 * actually use. Run after `npm run build`:
 *
 *   npm run scenes:verify
 *
 * Why this exists: scene art lives on an embedded Level document in Foundry v14
 * (`!scenes.levels!<sceneId>.<levelId>`), and a scene document that ships a
 * legacy top-level `background` — or that lacks the `_stats.coreVersion` schema
 * stamp — gets its Level thrown away by Foundry's `migrateLevels` migration on
 * import. The scene then imports blank, with no error anywhere. This check
 * fails the build pipeline instead.
 *
 * Checks, per scene document:
 *   1. `_stats.coreVersion` is stamped (migration gate).
 *   2. No legacy top-level `background` / `globalLight` / `darkness`.
 *   3. `levels[]` is non-empty and every referenced Level entry exists.
 *   4. Every Level carrying an image has a `background.src` that resolves to a
 *      real, non-empty file inside `dist/`.
 *   5. Reports the total artwork payload and the art file count.
 *
 * Exit codes: 0 = verified, 1 = gaps found.
 */
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'classic-level';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PACKS_DIR = path.join(DIST, 'packs');

const errors = [];
const notes = [];

/** Read all entries of a LevelDB pack as [key, value] pairs. */
async function packEntries(packPath) {
  const db = new ClassicLevel(packPath, { keyEncoding: 'utf8', valueEncoding: 'json' });
  const entries = [];
  for await (const [key, value] of db.iterator()) entries.push([key, value]);
  await db.close();
  return entries;
}

/** Map a Foundry `modules/<id>/…` path onto its file inside dist/. */
function distPathFor(src, moduleId) {
  const prefix = `modules/${moduleId}/`;
  const rel = src.startsWith(prefix) ? src.slice(prefix.length) : src;
  return path.join(DIST, rel);
}

async function verify() {
  const manifestPath = path.join(DIST, 'module.json');
  if (!(await fs.pathExists(manifestPath))) {
    errors.push('dist/module.json missing — run npm run build first');
    return;
  }
  const manifest = await fs.readJSON(manifestPath);
  const moduleId = manifest.id;
  const scenePacks = (manifest.packs ?? []).filter((p) => p.type === 'Scene');
  if (scenePacks.length === 0) {
    notes.push('no Scene packs declared — nothing to verify');
    return;
  }

  let sceneCount = 0;
  let artScenes = 0;
  let totalBytes = 0;
  /** @type {Set<string>} */
  const artFiles = new Set();
  let landingSeen = false;

  for (const pack of scenePacks) {
    const packName = path.basename(pack.path);
    const packPath = path.join(PACKS_DIR, packName);
    if (!(await fs.pathExists(packPath))) {
      errors.push(`${packName}: compiled pack missing — run npm run build`);
      continue;
    }

    const entries = await packEntries(packPath);
    const levels = new Map(
      entries.filter(([k]) => k.startsWith('!scenes.levels!')).map(([k, v]) => [k, v]),
    );
    const scenes = entries.filter(([k]) => k.startsWith('!scenes!'));

    for (const [key, scene] of scenes) {
      sceneCount++;
      const label = `${scene.name ?? key} (${key})`;

      if (!scene._stats?.coreVersion) errors.push(`${label}: missing _stats.coreVersion (Foundry will rebuild the Level)`);
      for (const legacy of ['background', 'globalLight', 'darkness', 'darknessLevel']) {
        if (scene[legacy] !== undefined) errors.push(`${label}: legacy top-level "${legacy}" shipped (Level background will be discarded)`);
      }
      if (!Array.isArray(scene.levels) || scene.levels.length === 0) {
        errors.push(`${label}: levels[] is empty — no embedded Level`);
        continue;
      }

      if (scene.flags?.[moduleId]?.landingPage) landingSeen = true;

      for (const levelId of scene.levels) {
        const levelKey = `!scenes.levels!${scene._id}.${levelId}`;
        const level = levels.get(levelKey);
        if (!level) {
          errors.push(`${label}: level entry ${levelKey} missing`);
          continue;
        }
        const src = level.background?.src;
        if (!src) {
          errors.push(`${label}: level "${level.name ?? levelId}" has no background.src`);
          continue;
        }
        const file = distPathFor(src, moduleId);
        if (!(await fs.pathExists(file))) {
          errors.push(`${label}: background file not found in dist: ${src}`);
          continue;
        }
        const { size } = await fs.stat(file);
        if (size === 0) {
          errors.push(`${label}: background file is empty: ${src}`);
          continue;
        }
        artScenes++;
        if (!artFiles.has(src)) {
          artFiles.add(src);
          totalBytes += size;
        }
      }
    }
  }

  if (sceneCount === 0) errors.push('no scene documents found in the declared Scene packs');
  if (!landingSeen && sceneCount > 0) {
    notes.push(`no scene carries the ${moduleId}.landingPage flag — the installer will not auto-activate a splash page`);
  }
  if (artScenes) {
    notes.push(`${artScenes} scene level(s) with artwork across ${artFiles.size} file(s), ${(totalBytes / 1048576).toFixed(2)} MB`);
  }
}

function report() {
  for (const note of notes) console.log(`scenes | OK — ${note}`);
  for (const error of errors) console.error(`scenes | FAIL — ${error}`);
  if (errors.length) {
    console.error(`\nscenes | FAIL — ${errors.length} problem(s); scene artwork is not import-safe.`);
    process.exit(1);
  }
  console.log('\nPASS: scene documents use v14 Levels, carry the migration stamp, and their artwork resolves inside dist/.');
}

await verify();
report();
