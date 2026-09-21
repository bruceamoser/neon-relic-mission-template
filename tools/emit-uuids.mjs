#!/usr/bin/env node
/**
 * Emit the deterministic slug → compendium UUID map.
 *
 * Authors reference cross-links in pack sources with slug fields (for example
 * `npcSlugs: [example-npc-curator]`); the build resolves them into the
 * `*Uuids` arrays using the same deterministic IDs. This tool prints the map
 * for debugging or manual authoring.
 *
 * Usage: npm run emit:uuids
 */
import fs from 'fs-extra';
import YAML from 'js-yaml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReferenceRegistry } from './lib/pack-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PACKS = path.join(ROOT, 'src', 'packs');
const STATIC_DIR = path.join(ROOT, 'static');

async function main() {
  const manifest = await fs.readJSON(path.join(STATIC_DIR, 'module.json'));
  const files = (await fs.readdir(SRC_PACKS)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();

  const packDocs = [];
  for (const file of files) {
    const documents = YAML.load(await fs.readFile(path.join(SRC_PACKS, file), 'utf8'));
    if (!Array.isArray(documents)) continue;
    packDocs.push({ file, packName: file.replace(/\.(yaml|yml)$/, ''), documents });
  }

  const registry = buildReferenceRegistry(packDocs, manifest.id);
  const rows = [...registry.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [slug, ref] of rows) {
    console.log(`${slug}\t${ref.uuid}`);
  }
  console.log(`# ${rows.length} referenceable documents`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
