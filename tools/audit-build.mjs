#!/usr/bin/env node
/**
 * Mission template — build audit.
 *
 * Verifies the compiled `dist/` against the module manifest AND the YAML
 * sources. Run after `npm run build`:
 *
 *   npm run audit
 *
 * Checks:
 *   1. Manifest validity: id/title/version present, core + system compatibility
 *      ranges declared, `relationships.systems` targets `neon-relic`.
 *   2. Manifest pack list ↔ dist/packs directories match exactly (no orphans).
 *   3. Source ↔ compiled parity per pack: every YAML document appears in the
 *      compiled LevelDB (top-level counts), and child entries (journal pages,
 *      table results, scene levels, playlist sounds) match the source counts.
 *   4. LevelDB key formats match the Foundry v14 layout
 *      (!items!, !actors!, !journal!, !journal.pages!, !tables!,
 *       !tables.results!, !macros!, !scenes!, !scenes.levels!, !playlists!,
 *       !playlists.sounds!), every scene document carries the modern Level shape
 *      + schema stamp, and the legacy top-level background/globalLight/darkness
 *      keys are absent. Playlist sound paths are checked against dist/.
 *   5. No unresolved authoring slug fields (`*Slugs`) leaked into the build,
 *      and every cross-reference UUID points back at this module.
 *
 * Exit codes: 0 = audit passed, 1 = gaps found.
 */
import fs from 'fs-extra';
import YAML from 'js-yaml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'classic-level';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PACKS_DIR = path.join(DIST, 'packs');
const SRC_PACKS = path.join(ROOT, 'src', 'packs');

const SYSTEM_ID = 'neon-relic';

/** Cross-reference UUID array fields produced from authoring slug fields. */
const LINK_FIELDS = [
  'npcUuids',
  'locationUuids',
  'organizationUuids',
  'informationCardUuids',
  'foundAtUuids',
  'knownByUuids',
  'startingKnowledgeUuids',
  'gainedKnowledgeUuids',
];

const errors = [];
const notes = [];

/** Read all entries of a LevelDB pack as [key, value] pairs. */
async function packEntries(packPath) {
  const db = new ClassicLevel(packPath, { keyEncoding: 'utf8', valueEncoding: 'json' });
  const entries = [];
  for await (const [key, value] of db.iterator()) entries.push([key, value]);
  await db.close();
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Load every source pack file. */
async function loadSourcePacks() {
  const files = (await fs.readdir(SRC_PACKS)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  const packs = [];
  for (const file of files) {
    const documents = YAML.load(await fs.readFile(path.join(SRC_PACKS, file), 'utf8'));
    if (Array.isArray(documents)) packs.push({ packName: file.replace(/\.(yaml|yml)$/, ''), documents });
  }
  return packs;
}

async function audit() {
  // ── 1. Manifest validity ────────────────────────────────
  const manifestPath = path.join(DIST, 'module.json');
  if (!(await fs.pathExists(manifestPath))) {
    errors.push('dist/module.json missing — run npm run build first');
    report();
    return;
  }
  const manifest = await fs.readJSON(manifestPath);
  if (!manifest.id) errors.push('module.json: missing "id"');
  if (!manifest.title) errors.push('module.json: missing "title"');
  if (!manifest.version) errors.push('module.json: missing "version"');
  if (!manifest.manifest?.includes('latest/download')) errors.push('module.json: "manifest" URL must use latest/download');
  if (!manifest.download?.includes('latest/download')) errors.push('module.json: "download" URL must use latest/download');
  const systems = manifest.relationships?.systems ?? [];
  const systemRef = systems.find((s) => s.id === SYSTEM_ID);
  if (!systemRef) errors.push(`module.json: relationships.systems must include "${SYSTEM_ID}"`);
  else if (!systemRef.compatibility?.minimum) errors.push(`module.json: system relationship needs compatibility.minimum`);
  else notes.push(`system requirement: ${SYSTEM_ID} ≥ ${systemRef.compatibility.minimum}`);

  // ── 2. Manifest ↔ dist/packs sync ───────────────────────
  const declaredPaths = (manifest.packs ?? []).map((p) => path.basename(p.path)).sort();
  const actualDirs = (await fs.readdir(PACKS_DIR)).sort();
  if (JSON.stringify(declaredPaths) !== JSON.stringify(actualDirs)) {
    errors.push(`manifest packs [${declaredPaths}] ≠ dist/packs dirs [${actualDirs}]`);
  } else {
    notes.push(`pack sync: ${declaredPaths.length} declared packs all present`);
  }

  // Compendium spoiler lock: mission packs default to GM-only so players cannot
  // browse DA briefs, walkthroughs and NPC sheets from their sidebar.
  const packs = manifest.packs ?? [];
  const unlocked = packs.filter((p) => p.ownership?.PLAYER !== 'NONE');
  if (unlocked.length) {
    notes.push(
      `packs not locked to GM: ${unlocked.map((p) => p.name).join(', ')} — players can browse these packs (see CONTENT-GUIDE §4.5)`,
    );
  } else if (packs.length) {
    notes.push(`pack ownership: all ${packs.length} packs locked to GM (PLAYER: NONE)`);
  }

  // ── 3. Source ↔ compiled parity ─────────────────────────
  const sourcePacks = await loadSourcePacks();
  const declaredNames = new Set((manifest.packs ?? []).map((p) => p.name));
  for (const { packName, documents } of sourcePacks) {
    if (!declaredNames.has(packName)) {
      errors.push(`src/packs/${packName}.yaml has no matching entry in module.json packs[]`);
      continue;
    }
    const packPath = path.join(PACKS_DIR, packName);
    if (!(await fs.pathExists(packPath))) {
      errors.push(`${packName}: missing compiled pack directory`);
      continue;
    }
    const entries = await packEntries(packPath);
    const keys = entries.map(([key]) => key);
    const top = keys.filter((k) => !k.slice(1).includes('.'));

    if (top.length !== documents.length) {
      errors.push(`${packName}: source has ${documents.length} documents, compiled pack has ${top.length}`);
    } else {
      notes.push(`${packName}: ${top.length} documents`);
    }

    // Child-entry parity: journal pages and table results.
    const expectedPages = documents.reduce(
      (n, d) => n + ((d.type === 'journalEntry' || d.type === 'JournalEntry') ? Math.max(d.pages?.length ?? 1, 1) : 0),
      0,
    );
    const expectedResults = documents.reduce((n, d) => n + (d.type === 'rollTable' ? d.system?.entries?.length ?? 0 : 0), 0);
    const expectedLevels = documents.reduce(
      (n, d) => n + (d.type === 'scene' || d.type === 'Scene' ? 1 : 0),
      0,
    );
    const expectedSounds = documents.reduce(
      (n, d) => n + (d.type === 'playlist' || d.type === 'Playlist' ? (d.sounds?.length ?? 0) : 0),
      0,
    );
    const pageEntries = keys.filter((k) => k.startsWith('!journal.pages!')).length;
    const resultEntries = keys.filter((k) => k.startsWith('!tables.results!')).length;
    const levelEntries = keys.filter((k) => k.startsWith('!scenes.levels!')).length;
    const soundEntries = keys.filter((k) => k.startsWith('!playlists.sounds!')).length;
    if (pageEntries !== expectedPages) errors.push(`${packName}: expected ${expectedPages} journal pages, found ${pageEntries}`);
    else if (expectedPages) notes.push(`${packName}: ${pageEntries} journal pages`);
    if (resultEntries !== expectedResults) errors.push(`${packName}: expected ${expectedResults} table results, found ${resultEntries}`);
    else if (expectedResults) notes.push(`${packName}: ${resultEntries} table results`);
    if (levelEntries !== expectedLevels) errors.push(`${packName}: expected ${expectedLevels} scene levels, found ${levelEntries}`);
    else if (expectedLevels) notes.push(`${packName}: ${levelEntries} scene levels`);
    if (soundEntries !== expectedSounds) errors.push(`${packName}: expected ${expectedSounds} playlist sounds, found ${soundEntries}`);
    else if (expectedSounds) notes.push(`${packName}: ${soundEntries} playlist sounds`);

    // Playlist sounds must point at files that actually ship inside dist/ — a
    // broken path is silent at the table (the GM simply gets no audio).
    for (const [key, value] of entries) {
      if (!key.startsWith('!playlists.sounds!')) continue;
      const soundPath = value?.path ?? '';
      const prefix = `modules/${manifest.id}/`;
      if (!soundPath.startsWith(prefix)) {
        errors.push(`${key}: sound path must live inside the module → ${soundPath || '(empty)'}`);
        continue;
      }
      const rel = soundPath.slice(prefix.length);
      if (!(await fs.pathExists(path.join(DIST, rel)))) {
        errors.push(`${key}: sound file missing from dist → ${rel}`);
      }
    }

    // Scene documents must carry the modern v14 shape: background on an
    // embedded Level, no legacy top-level background/globalLight/darkness,
    // and the schema stamp that stops Foundry rebuilding the Level.
    for (const [key, value] of entries) {
      if (!key.startsWith('!scenes!')) continue;
      for (const legacy of ['background', 'globalLight', 'darkness', 'darknessLevel']) {
        if (value[legacy] !== undefined) errors.push(`${key}: legacy top-level "${legacy}" must not ship (breaks v14 Level backgrounds)`);
      }
      if (!Array.isArray(value.levels) || value.levels.length === 0) errors.push(`${key}: missing levels[]`);
      if (!value._stats?.coreVersion) errors.push(`${key}: missing _stats.coreVersion schema stamp`);
    }

    // ── 4. Key formats ────────────────────────────────────
    for (const key of keys) {
      const ok = /^!(items|actors|journal|journal\.pages|tables|tables\.results|macros|scenes|scenes\.levels|playlists|playlists\.sounds)!/u.test(key);
      if (!ok) errors.push(`${packName}: unexpected key format "${key}"`);
    }

    // ── 5. Cross-link integrity ───────────────────────────
    let linkCount = 0;
    for (const [key, value] of entries) {
      if (!(key.startsWith('!items!') || key.startsWith('!actors!'))) continue;
      const sys = value?.system ?? {};
      for (const [field, v] of Object.entries(sys)) {
        if (field.endsWith('Slugs')) errors.push(`${key}: unresolved authoring field "${field}" leaked into build`);
        if (!LINK_FIELDS.includes(field) || !Array.isArray(v)) continue;
        linkCount += v.length;
        for (const uuid of v) {
          if (typeof uuid !== 'string' || !uuid.startsWith(`Compendium.${manifest.id}.`)) {
            errors.push(`${key}.${field}: bad uuid "${uuid}"`);
          }
        }
        // Case board org tracks resolve orgSlug → orgUuid as a plain string.
      }
      if (key.startsWith('!items!') && value?.type === 'caseBoard') {
        for (const org of value?.system?.organizations ?? []) {
          if (org?.orgUuid && !org.orgUuid.startsWith(`Compendium.${manifest.id}.`)) {
            errors.push(`${key}: caseBoard org "${org.id}" orgUuid points outside the module`);
          }
        }
      }
    }
    if (linkCount) notes.push(`${packName}: ${linkCount} cross-link UUIDs`);
  }

  report();
}

function report() {
  for (const n of notes) console.log(`audit | OK — ${n}`);
  if (errors.length) {
    console.error(`audit | FAILED — ${errors.length} gap(s):`);
    for (const e of errors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }
  console.log('audit | PASS — manifest, packs, parity, and cross-links verified');
}

audit().catch((err) => {
  console.error('audit | crashed');
  console.error(err);
  process.exit(1);
});
