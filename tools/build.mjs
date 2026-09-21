#!/usr/bin/env node
/**
 * Mission template — build pipeline.
 *
 * Compiles `src/packs/*.yaml` into Foundry VTT v14 LevelDB compendium packs and
 * copies static files (`static/` and `src/assets/`) into `dist/`.
 *
 * This is a lean Node port of the pack compiler in the Neon Relic system's
 * `gulpfile.js`. It intentionally produces the identical v14 document layout:
 *   - deterministic 16-char IDs from YAML `_id` slugs (see tools/lib/pack-lib.mjs)
 *   - journal pages stored as separate entries
 *   - roll table results stored as separate entries
 *   - `compactRange()` before closing LevelDB to avoid phantom index entries
 *
 * The module id is read from `static/module.json` — no hardcoded ids.
 *
 * Usage:
 *   node tools/build.mjs           # clean + build
 *   node tools/build.mjs --clean   # remove dist/ only
 */
import fs from 'fs-extra';
import YAML from 'js-yaml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'classic-level';
import { buildReferenceRegistry, transformDocument } from './lib/pack-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PACKS = path.join(ROOT, 'src', 'packs');
const SRC_ASSETS = path.join(ROOT, 'src', 'assets');
const STATIC_DIR = path.join(ROOT, 'static');
const DIST = path.join(ROOT, 'dist');

let LOG_TAG = 'mission-template';

/* ------------------------------------------ */
/*  Clean                                     */
/* ------------------------------------------ */

async function cleanDist() {
  await fs.remove(DIST);
  console.log(`${LOG_TAG} | cleaned dist/`);
}

/* ------------------------------------------ */
/*  Static files                              */
/* ------------------------------------------ */

async function copyStatics() {
  if (await fs.pathExists(STATIC_DIR)) {
    await fs.copy(STATIC_DIR, DIST);
  }
  if (await fs.pathExists(SRC_ASSETS)) {
    // Internal reference material (mood boards, source art, research scans)
    // must never ship in the module. Any directory named "references"
    // anywhere under src/assets/ is excluded from the copy.
    const isReferencePath = (src) => src.split(path.sep).includes('references');
    await fs.copy(SRC_ASSETS, path.join(DIST, 'assets'), { filter: (src) => !isReferencePath(src) });
  }
}

/* ------------------------------------------ */
/*  Pack compilation                          */
/* ------------------------------------------ */

async function buildPacks() {
  if (!(await fs.pathExists(SRC_PACKS))) return;
  const files = (await fs.readdir(SRC_PACKS)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (files.length === 0) return;

  // Pass 1: load every source file so cross-references can resolve across packs.
  const packDocs = [];
  for (const file of files.sort()) {
    const raw = await fs.readFile(path.join(SRC_PACKS, file), 'utf8');
    const documents = YAML.load(raw);
    const packName = file.replace(/\.(yaml|yml)$/, '');
    if (!Array.isArray(documents) || documents.length === 0) {
      console.log(`${LOG_TAG} | ${file}: no documents yet, skipping`);
      continue;
    }
    packDocs.push({ file, packName, documents });
  }

  // Pass 2: build the slug → compendium UUID registry, then compile each pack.
  const manifest = await fs.readJSON(path.join(STATIC_DIR, 'module.json'));
  const registry = buildReferenceRegistry(packDocs, manifest.id);

  const outputDir = path.join(DIST, 'packs');
  await fs.ensureDir(outputDir);

  for (const { file, packName, documents } of packDocs) {
    const packPath = path.join(outputDir, packName);

    // Clean and create LevelDB directory.
    await fs.remove(packPath);
    const db = new ClassicLevel(packPath, { keyEncoding: 'utf8', valueEncoding: 'json' });

    let count = 0;
    for (const doc of documents) {
      const entries = transformDocument(doc, { registry });
      if (!entries) {
        console.warn(`${LOG_TAG} | unknown type "${doc.type}" in ${file}, skipping`);
        continue;
      }
      for (const entry of entries) {
        await db.put(entry.key, entry.data);
      }
      count++;
    }

    // Force compaction from WAL (.log) to SST (.ldb) before closing.
    // Without this, Foundry may create phantom index entries when reading
    // un-compacted LevelDB data.
    await db.compactRange('\x00', '\xff');
    await db.close();
    console.log(`${LOG_TAG} | compiled ${count} entries → packs/${packName}`);
  }
}

/* ------------------------------------------ */
/*  Main                                      */
/* ------------------------------------------ */

async function main() {
  if (process.argv.includes('--clean')) {
    await cleanDist();
    return;
  }

  const manifestPath = path.join(STATIC_DIR, 'module.json');
  if (await fs.pathExists(manifestPath)) {
    LOG_TAG = (await fs.readJSON(manifestPath)).id || LOG_TAG;
  }

  await cleanDist();
  await copyStatics();
  await buildPacks();
  console.log(`${LOG_TAG} | build complete`);
}

main().catch((err) => {
  console.error(`${LOG_TAG} | BUILD FAILED`);
  console.error(err);
  process.exit(1);
});
