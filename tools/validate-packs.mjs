#!/usr/bin/env node
/**
 * Mission template — pack validation tooling.
 *
 * Validates every YAML document in `src/packs/` against the neon-relic system's
 * document types and data-model constraints before it is compiled. Run this
 * alongside `npm run build` in every content change.
 *
 * Usage:
 *   node tools/validate-packs.mjs              # validate src/packs/*
 *   node tools/validate-packs.mjs --self-test  # prove failure detection works
 *
 * Exit codes: 0 = clean, 1 = validation errors (or self-test failure).
 */
import fs from 'fs-extra';
import YAML from 'js-yaml';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTOR_TYPES, ITEM_TYPES } from './lib/pack-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PACKS = path.join(ROOT, 'src', 'packs');
const SRC_ASSETS = path.join(ROOT, 'src');

let LOG_TAG = 'mission-template';
let MODULE_ASSET_PREFIX = '';

/* ------------------------------------------ */
/*  Enums (mirrors neon-relic data models)    */
/* ------------------------------------------ */

const DIE_VALUES = new Set(['d20', 'd12', 'd10', 'd8', 'd6', 'd4']);

const ENUMS = {
  'informationCard.cardType': new Set(['supportingIntel', 'containmentTruth']),
  'location.availability': new Set(['open', 'clue', 'contact', 'time', 'packet']),
  'relicSheet.category': new Set(['object', 'text', 'location', 'entity', 'phenomenon']),
  'talent.frequency': new Set(['at-will', 'per-session', 'per-case-file']),
  'criticalInjury.injuryType': new Set(['physical', 'mental']),
};

const RANGES = {
  'artifact.tier': [1, 3],
  'relicSheet.tier': [1, 4],
  'npc.tier': [1, 4],
  'npc.disposition': [1, 5],
  'mob.memberCount': [1, 5],
  'daCaseBrief.relicTier': [1, 4],
  'informationCard.hqFallback': [0, 14],
};

const UUID_ARRAY_FIELDS = [
  'foundAtUuids',
  'knownByUuids',
  'npcUuids',
  'locationUuids',
  'informationCardUuids',
  'organizationUuids',
];

/* ------------------------------------------ */
/*  Helpers                                   */
/* ------------------------------------------ */

const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isInt = (v) => Number.isInteger(v);

/**
 * Verify that a module-relative asset path exists in `src/assets`.
 * Paths pointing outside the module (system/core icons) are ignored.
 * @param {unknown} p
 * @param {string} label
 * @param {string[]} errors
 * @param {{optional?: boolean}} [options]
 */
function checkImageRef(p, label, errors, { optional = true } = {}) {
  if (typeof p !== 'string' || p.trim() === '') {
    if (!optional) errors.push(`${label}: missing image path`);
    return;
  }
  if (!p.startsWith(MODULE_ASSET_PREFIX)) return;
  const rel = p.slice(MODULE_ASSET_PREFIX.length);
  if (!fs.existsSync(path.join(SRC_ASSETS, rel))) {
    errors.push(`${label}: image not found in src/assets → ${rel}`);
  }
}

/* ------------------------------------------ */
/*  Per-document validation                   */
/* ------------------------------------------ */

/**
 * Validate a single document; pushes human-readable errors.
 * @param {object} doc
 * @param {string[]} errors
 */
function validateDocument(doc, errors) {
  const label = doc && typeof doc === 'object' ? doc._id || doc.name || '(unnamed)' : '(invalid doc)';

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push(`${label}: document must be a YAML mapping`);
    return;
  }
  if (typeof doc._id !== 'string' || doc._id.trim() === '') errors.push(`${label}: missing "_id" slug`);
  else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(doc._id)) errors.push(`${label}: "_id" must be alphanumeric/dash/underscore`);
  if (typeof doc.name !== 'string' || doc.name.trim() === '') errors.push(`${label}: missing "name"`);
  if (typeof doc.type !== 'string' || doc.type.trim() === '') errors.push(`${label}: missing "type"`);

  const sys = doc.system ?? {};
  if (sys !== null && typeof sys !== 'object') errors.push(`${label}: "system" must be a mapping`);

  // --- Items ---------------------------------------------------------
  if (ITEM_TYPES.has(doc.type)) {
    if (doc.type === 'informationCard') {
      checkEnum(sys.cardType, 'informationCard.cardType', label, errors, { optional: true });
      checkRange(sys.hqFallback, 'informationCard.hqFallback', label, errors, { optional: true });
    }
    if (doc.type === 'location') {
      checkEnum(sys.availability, 'location.availability', label, errors, { optional: true });
    }
    if (doc.type === 'artifact') {
      checkRange(sys.tier, 'artifact.tier', label, errors, { optional: true });
      checkDie(sys.artifactDie?.current, `${label}: artifact.artifactDie.current`, errors, { optional: true });
      checkDie(sys.artifactDie?.starting, `${label}: artifact.artifactDie.starting`, errors, { optional: true });
    }
    if (doc.type === 'relicSheet') {
      checkRange(sys.tier, 'relicSheet.tier', label, errors, { optional: true });
      checkEnum(sys.category, 'relicSheet.category', label, errors, { optional: true });
      checkDie(sys.artifactDie, `${label}: relicSheet.artifactDie`, errors, { optional: true });
      if (sys.containmentTruths !== undefined) {
        if (!Array.isArray(sys.containmentTruths)) errors.push(`${label}: relicSheet.containmentTruths must be an array`);
        else {
          sys.containmentTruths.forEach((t, i) => {
            if (t === null || typeof t !== 'object') errors.push(`${label}: containmentTruths[${i}] must be a mapping`);
          });
        }
      }
    }
    if (doc.type === 'talent') checkEnum(sys.frequency, 'talent.frequency', label, errors, { optional: true });
    if (doc.type === 'criticalInjury') checkEnum(sys.injuryType, 'criticalInjury.injuryType', label, errors, { optional: true });
    if (doc.type === 'daCaseBrief' && sys.relicMilestones !== undefined) {
      if (!Array.isArray(sys.relicMilestones)) errors.push(`${label}: daCaseBrief.relicMilestones must be an array`);
      else {
        sys.relicMilestones.forEach((m, i) => {
          if (!isInt(m?.day) || m.day < 0 || m.day > 14) {
            errors.push(`${label}: relicMilestones[${i}].day must be an integer 0–14`);
          }
        });
      }
    }

    // Cross-reference UUID arrays must be arrays of strings (empty is fine).
    for (const field of UUID_ARRAY_FIELDS) {
      if (sys[field] !== undefined && !isStringArray(sys[field])) {
        errors.push(`${label}: system.${field} must be an array of strings`);
      }
    }
    checkImageRef(doc.img, label, errors);
    return;
  }

  // --- Actors ----------------------------------------------------------
  if (ACTOR_TYPES.has(doc.type)) {
    if (doc.type === 'npc') {
      checkRange(sys.tier, 'npc.tier', label, errors, { optional: true });
      checkRange(sys.disposition, 'npc.disposition', label, errors, { optional: true });
    }
    if (doc.type === 'mob') checkRange(sys.memberCount, 'mob.memberCount', label, errors, { optional: true });
    checkImageRef(doc.img, label, errors);
    checkImageRef(doc.prototypeToken?.texture?.src, `${label}: prototypeToken`, errors);
    return;
  }

  // --- Journals ---------------------------------------------------------
  if (doc.type === 'journalEntry' || doc.type === 'JournalEntry') {
    if (doc.pages === undefined) {
      if (typeof sys.summary !== 'string' || sys.summary.trim() === '') {
        errors.push(`${label}: journal needs either a "pages" array or system.summary text`);
      }
      return;
    }
    if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
      errors.push(`${label}: "pages" must be a non-empty array`);
      return;
    }
    doc.pages.forEach((p, i) => {
      if (typeof p?.name !== 'string' || p.name.trim() === '') errors.push(`${label}: pages[${i}] missing "name"`);
      if (typeof p?.text?.content !== 'string' || p.text.content.trim() === '') {
        errors.push(`${label}: pages[${i}] has empty "text.content"`);
      }
    });
    return;
  }

  // --- Roll tables --------------------------------------------------------
  if (doc.type === 'rollTable') {
    if (typeof sys.formula !== 'string' || sys.formula.trim() === '') errors.push(`${label}: rollTable needs system.formula`);
    if (!Array.isArray(sys.entries) || sys.entries.length === 0) {
      errors.push(`${label}: rollTable needs a non-empty system.entries array`);
      return;
    }
    sys.entries.forEach((e, i) => {
      const r = e?.range;
      if (!Array.isArray(r) || r.length !== 2 || !isInt(r[0]) || !isInt(r[1]) || r[0] > r[1]) {
        errors.push(`${label}: entries[${i}].range must be [low, high] integers with low <= high`);
      }
      if (typeof e?.result !== 'string' || e.result.trim() === '') errors.push(`${label}: entries[${i}] missing "result"`);
    });
    return;
  }

  // --- Scenes -----------------------------------------------------------
  if (doc.type === 'scene' || doc.type === 'Scene') {
    checkImageRef(doc.background?.src, `${label}: background`, errors, { optional: false });
    if (doc.width !== undefined && !isInt(doc.width)) errors.push(`${label}: scene.width must be an integer`);
    if (doc.height !== undefined && !isInt(doc.height)) errors.push(`${label}: scene.height must be an integer`);
    if (doc.grid?.type !== undefined && !isInt(doc.grid.type)) errors.push(`${label}: scene.grid.type must be an integer`);
    if (doc.grid?.size !== undefined && !isInt(doc.grid.size)) errors.push(`${label}: scene.grid.size must be an integer`);
    if (doc.initial !== undefined && (typeof doc.initial !== 'object' || doc.initial === null)) {
      errors.push(`${label}: scene.initial must be an object ({x, y, scale}) — it is the initial view, not a boolean flag`);
    }
    // Compiled shapes belong to the build: v14 stores the background on an
    // embedded Level, and authoring the legacy top-level keys makes Foundry's
    // migrateLevels migration discard that Level (scene imports blank).
    for (const reserved of ['levels', 'initialLevel', 'globalLight', 'darkness', 'darknessLevel']) {
      if (doc[reserved] !== undefined) {
        errors.push(
          `${label}: scene.${reserved} must not be authored — author background.src instead; the build compiles it onto a v14 Level`,
        );
      }
    }
    return;
  }

  if (doc.type !== 'macro') {
    errors.push(`${label}: unknown document type "${doc.type}"`);
  }
}

/* ------------------------------------------ */
/*  Field checks                              */
/* ------------------------------------------ */

function checkEnum(value, key, label, errors, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!optional) errors.push(`${label}: missing ${key}`);
    return;
  }
  const allowed = ENUMS[key];
  if (allowed && !allowed.has(value)) {
    errors.push(`${label}: ${key} "${value}" is not one of [${[...allowed].join(', ')}]`);
  }
}

function checkRange(value, key, label, errors, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (!optional) errors.push(`${label}: missing ${key}`);
    return;
  }
  const [min, max] = RANGES[key];
  if (!isInt(value) || value < min || value > max) errors.push(`${label}: ${key} must be an integer ${min}–${max}`);
}

function checkDie(value, labelText, errors, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!optional) errors.push(`${labelText}: missing`);
    return;
  }
  if (!DIE_VALUES.has(value)) {
    errors.push(`${labelText}: "${value}" is not one of [${[...DIE_VALUES].join(', ')}]`);
  }
}

/* ------------------------------------------ */
/*  Pack-file validation                      */
/* ------------------------------------------ */

/**
 * Validate a set of documents plus cross-pack ID uniqueness.
 * @param {Array<{file: string, documents: Array<object>}>} packs
 * @returns {string[]} errors
 */
export function validatePacks(packs) {
  const errors = [];
  const seenIds = new Map();

  for (const { file, documents } of packs) {
    if (!Array.isArray(documents)) continue;
    const namesInPack = new Set();
    documents.forEach((doc) => {
      const docErrors = [];
      validateDocument(doc, docErrors);
      errors.push(...docErrors.map((e) => `${file}: ${e}`));

      if (doc?._id) {
        if (seenIds.has(doc._id)) errors.push(`${file}: duplicate _id "${doc._id}" (also in ${seenIds.get(doc._id)})`);
        else seenIds.set(doc._id, file);
      }
      if (doc?.name) {
        if (namesInPack.has(doc.name)) errors.push(`${file}: duplicate name "${doc.name}"`);
        namesInPack.add(doc.name);
      }
    });
  }

  return errors;
}

/* ------------------------------------------ */
/*  Self-test                                 */
/* ------------------------------------------ */

function runSelfTest() {
  const fixtures = [
    {
      name: 'missing _id',
      packs: [{ file: 'fixture.yaml', documents: [{ name: 'X', type: 'artifact', system: {} }] }],
      expect: /missing "_id"/,
    },
    {
      name: 'bad cardType',
      packs: [
        {
          file: 'fixture.yaml',
          documents: [{ _id: 'x1', name: 'X', type: 'informationCard', system: { cardType: 'lore' } }],
        },
      ],
      expect: /cardType/,
    },
    {
      name: 'bad roll table range',
      packs: [
        {
          file: 'fixture.yaml',
          documents: [
            { _id: 'x2', name: 'T', type: 'rollTable', system: { formula: '1d6', entries: [{ range: [3, 1], result: 'x' }] } },
          ],
        },
      ],
      expect: /range/,
    },
    {
      name: 'duplicate _id',
      packs: [
        {
          file: 'fixture.yaml',
          documents: [
            { _id: 'dup', name: 'A', type: 'gear', system: {} },
            { _id: 'dup', name: 'B', type: 'gear', system: {} },
          ],
        },
      ],
      expect: /duplicate _id/,
    },
    {
      name: 'bad die value',
      packs: [
        {
          file: 'fixture.yaml',
          documents: [{ _id: 'x3', name: 'R', type: 'relicSheet', system: { artifactDie: 'd100' } }],
        },
      ],
      expect: /artifactDie/,
    },
    {
      name: 'legacy scene level keys',
      packs: [
        {
          file: 'fixture.yaml',
          documents: [
            {
              _id: 'x4',
              name: 'S',
              type: 'scene',
              background: { src: 'modules/neon-relic-mission-template/assets/examples/example-landing.svg' },
              globalLight: true,
            },
          ],
        },
      ],
      expect: /must not be authored/,
    },
    {
      name: 'scene without background',
      packs: [{ file: 'fixture.yaml', documents: [{ _id: 'x5', name: 'S', type: 'scene' }] }],
      expect: /background/,
    },
  ];

  let failures = 0;
  for (const f of fixtures) {
    const errors = validatePacks(f.packs);
    const hit = errors.some((e) => f.expect.test(e));
    if (hit) console.log(`self-test | PASS — ${f.name}`);
    else {
      failures++;
      console.error(`self-test | FAIL — ${f.name}: expected ${f.expect}, got: ${errors.join(' | ') || '(no errors)'}`);
    }
  }
  return failures;
}

/* ------------------------------------------ */
/*  Main                                      */
/* ------------------------------------------ */

async function main() {
  if (process.argv.includes('--self-test')) {
    const failures = runSelfTest();
    process.exit(failures === 0 ? 0 : 1);
  }

  const manifestPath = path.join(ROOT, 'static', 'module.json');
  if (await fs.pathExists(manifestPath)) {
    const manifest = await fs.readJSON(manifestPath);
    LOG_TAG = manifest.id || LOG_TAG;
    // img paths in pack sources look like "modules/<id>/assets/..."
    MODULE_ASSET_PREFIX = `modules/${manifest.id}/`;
  }

  const files = (await fs.readdir(SRC_PACKS)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  const packs = [];
  let docCount = 0;

  for (const file of files) {
    const raw = await fs.readFile(path.join(SRC_PACKS, file), 'utf8');
    const documents = YAML.load(raw);
    if (!Array.isArray(documents)) {
      packs.push({ file, documents: [] });
      continue;
    }
    docCount += documents.length;
    packs.push({ file, documents });
  }

  const errors = validatePacks(packs);

  if (errors.length > 0) {
    console.error(`${LOG_TAG} | validation FAILED (${errors.length} issue(s)):`);
    for (const e of errors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }

  console.log(`${LOG_TAG} | validation passed — ${files.length} pack files, ${docCount} documents`);
}

main().catch((err) => {
  console.error('mission-template | validation crashed');
  console.error(err);
  process.exit(1);
});
