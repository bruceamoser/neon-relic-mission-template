/**
 * Mission template — module entry point.
 *
 * Provides:
 *   1. A neon-relic system guard: the module is inert in worlds running any
 *      other system (Foundry already hides/filters such modules, but this
 *      guard is the belt-and-braces the platform does not provide).
 *   2. A Content Installer (Configure Settings → Module Settings → this
 *      module): imports every compendium pack into the world inside a
 *      per-module folder tree, overwriting by document id on re-run.
 *   3. Landing scene activation: a scene flagged `landingPage` is activated
 *      automatically when the world has no active scene.
 *   4. Scene-art repair: re-running the installer keeps each world scene's
 *      reveal state (active/navigation/ownership) and restores the Level
 *      background on scenes imported by builds that stored the art on the
 *      legacy top-level `background` field — those scenes showed up blank.
 *
 * Rename checklist when adapting this template:
 *   - change MODULE_ID below to match the `id` in static/module.json
 *   - change the example scene's flag namespace (example-scenes.yaml) to your id
 *   - everything else is derived from the module manifest at runtime.
 */
const MODULE_ID = 'neon-relic-mission-template';

/** The game system this module requires. */
const SYSTEM_ID = 'neon-relic';

/**
 * Is this module running under its required game system?
 * @returns {boolean}
 */
function systemIsSupported() {
  return game?.system?.id === SYSTEM_ID;
}

/** Root folder name for imported content — the module title. */
function rootFolderName() {
  return game.modules.get(MODULE_ID)?.title ?? MODULE_ID;
}

/* -------------------------------------------- */
/*  Content installer                             */
/* -------------------------------------------- */

/**
 * Find or create a folder in a document collection.
 * @param {string} name
 * @param {string} type - Collection type (Item, Actor, JournalEntry, RollTable, Scene).
 * @param {string|null} [parentId]
 * @returns {Promise<string>} The folder id.
 */
async function ensureFolder(name, type, parentId = null) {
  const existing = game.folders.find(
    (f) => f.type === type && f.name === name && (f.folder?.id ?? null) === parentId,
  );
  if (existing) return existing.id;
  const folder = await Folder.create({ name, type, folder: parentId, sorting: 'a' });
  return folder.id;
}

/**
 * Import plan derived from the LIVE compendium collections: every pack of this
 * module becomes a subfolder under the module root, except Scene packs
 * (kept at the root so the landing scene is easy to find).
 *
 * Also reports packs the manifest declares but this server has not registered:
 * Foundry registers compendium packs at server start, so a pack added by a
 * module update does not exist in `game.packs` until Foundry is restarted —
 * without this check the installer would skip it silently.
 * @returns {{plan: Array<{pack: string, type: string, label: string, folder: string|null}>, missing: string[]}}
 */
function buildInstallPlan() {
  const plan = [];
  const declared = [...(game.modules.get(MODULE_ID)?.packs ?? [])].map((p) => p.name);
  for (const pack of game.packs) {
    if (!pack.collection.startsWith(`${MODULE_ID}.`)) continue;
    const { name, label, type } = pack.metadata ?? {};
    if (!name || !type) continue;
    plan.push({
      pack: name,
      type,
      label: label ?? name,
      folder: type === 'Scene' ? null : (label ?? name),
    });
  }
  const missing = declared.filter((name) => !game.packs.get(`${MODULE_ID}.${name}`));
  return { plan, missing };
}

/**
 * Reconcile an incoming pack Scene with the world copy it is about to
 * overwrite.
 *
 * Scenes hold player-facing state the pack knows nothing about, so the update
 * is filtered to what the pack actually owns:
 *   - `active` / `navigation` / `ownership` are world reveal state → dropped.
 *   - The pack authors exactly one background Level; it is remapped onto the
 *     world scene's existing Level id, so re-running the installer never
 *     duplicates Levels (and heals legacy `defaultLevel0000` imports).
 *
 * Also heals scenes imported by an older build: when neither the pack Level nor
 * the world Level carries a background source, the scene thumbnail is used and
 * the repair is counted.
 * @param {Scene} existing - The world scene being updated.
 * @param {object} data - Incoming pack document data.
 * @param {{repaired: number}} stats - Repair counter, reported in the summary.
 * @returns {object} The filtered update data.
 */
function prepareSceneUpdate(existing, data, stats) {
  const update = data;
  if (existing.active) delete update.active;
  delete update.navigation;
  delete update.ownership;

  const worldLevels = existing.levels?.contents ?? [];
  const packLevels = Array.isArray(update.levels) ? update.levels : [];
  const packLevel = packLevels.length === 1 ? packLevels[0] : null;
  if (!packLevel) return update;

  if (!packLevel.background?.src && typeof update.thumb === 'string' && update.thumb.includes(MODULE_ID)) {
    packLevel.background = { ...packLevel.background, src: update.thumb };
  }

  const initialLevel = existing.initialLevel;
  const levelId = initialLevel?.id ?? worldLevels[0]?.id;
  if (levelId) {
    if (!initialLevel?.background?.src) stats.repaired++;
    update.levels = [{ ...packLevel, _id: levelId }];
    update.initialLevel = levelId;
  }
  return update;
}

/**
 * Import or refresh every module pack into the world.
 *
 * World documents whose IDs match a pack document are UPDATED in place, so
 * running the installer after a module update refreshes existing content
 * without creating duplicates. Note that in-place updates REPLACE world
 * documents with pack versions — any playtest state stored on the documents
 * (checkboxes, counters, day markers) is reset.
 * @returns {Promise<void>}
 */
async function installContent() {
  if (!systemIsSupported()) {
    ui.notifications.error(
      `${game.modules.get(MODULE_ID)?.title ?? MODULE_ID} requires the "${SYSTEM_ID}" game system — this world runs "${game.system.id}".`,
    );
    return;
  }

  const { plan, missing } = buildInstallPlan();
  if (plan.length === 0) {
    ui.notifications.error(`${MODULE_ID} | no packs declared in the module manifest.`);
    return;
  }

  const notification = ui.notifications.info(`${rootFolderName()} — installing content…`, { permanent: true });
  let created = 0;
  let updated = 0;
  let failed = 0;
  const sceneStats = { repaired: 0 };

  if (missing.length) {
    ui.notifications.warn(
      `${rootFolderName()} — this build added ${missing.length} new pack(s) that Foundry has not loaded yet: ${missing.join(', ')}. ` +
        'Restart Foundry (quit the app, not just the world), then run the installer again.',
      { permanent: true },
    );
    console.warn(`${MODULE_ID} | installer: packs declared but not registered`, missing);
  }

  for (const { pack: packName, type, label, folder: subfolderName } of plan) {
    const pack = game.packs.get(`${MODULE_ID}.${packName}`);
    if (!pack) {
      console.warn(`${MODULE_ID} | installer: pack ${packName} not found, skipping`);
      continue;
    }

    // Resolve the destination folder structure for this pack's collection
    let folderId = null;
    try {
      const rootId = await ensureFolder(rootFolderName(), type);
      folderId = subfolderName ? await ensureFolder(label, type, rootId) : rootId;
    } catch (err) {
      console.warn(`${MODULE_ID} | installer: folder setup failed for ${packName}`, err);
    }

    let docs;
    try {
      docs = await pack.getDocuments();
    } catch (err) {
      console.error(`${MODULE_ID} | installer: failed to read pack ${packName}`, err);
      failed++;
      continue;
    }

    for (const doc of docs) {
      const data = doc.toObject();
      if (folderId) data.folder = folderId;
      const collection = game.collections.get(doc.documentName);
      const existing = collection?.get(doc.id);
      try {
        if (existing) {
          // Overwrite in place, keeping the pack ID and any world-side
          // additions the update does not touch (diff: false = no deletions).
          const update = doc.documentName === 'Scene' ? prepareSceneUpdate(existing, data, sceneStats) : data;
          await existing.update(update, { diff: false });
          updated++;
        } else {
          await doc.constructor.create(data, { keepId: true });
          created++;
        }
      } catch (err) {
        failed++;
        console.error(`${MODULE_ID} | installer: ${packName}/${doc.name} (${doc.id})`, err);
      }
    }
  }

  // Bring up the module landing page when the world has no active scene yet.
  if (!game.scenes.active) {
    const landing = game.scenes.find((s) => s.getFlag(MODULE_ID, 'landingPage'));
    if (landing) {
      try {
        await landing.activate();
      } catch (err) {
        console.warn(`${MODULE_ID} | installer: could not activate landing scene`, err);
      }
    }
  }

  notification?.remove?.();
  const summary = `${rootFolderName()} — content ready (${created} new, ${updated} updated${
    sceneStats.repaired ? `, ${sceneStats.repaired} scenes repaired` : ''
  }${failed ? `, ${failed} failed` : ''}${
    missing.length ? `, ${missing.length} pack(s) awaiting a Foundry restart` : ''
  }).`;
  console.log(`${MODULE_ID} | installer: ${summary}`);
  if (failed) {
    ui.notifications.error(`${failed} document(s) failed to install — see the console for details.`);
  }
  ui.notifications.info(summary, { permanent: true });
  ChatMessage.create({ content: `<p>${summary}</p>`, whisper: [game.user.id] });
}

/**
 * Settings-menu dialog for the content installer.
 */
class MissionInstaller extends foundry.applications.api.DialogV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-content-installer`,
    window: { title: `${game.modules.get(MODULE_ID)?.title ?? MODULE_ID} — Content Installer`, resizable: false },
    position: { width: 480, height: 'auto' },
    content: `<p>Import this module's compendium content into the world.</p>
      <ul>
        <li>Documents already in this world with matching IDs are <strong>overwritten</strong> with the current pack versions.</li>
        <li>New documents are added, keeping their pack IDs.</li>
        <li>Content is organised into a <strong>module folder</strong> with one subfolder per pack (per its manifest label).</li>
        <li>The module <strong>landing scene</strong> is imported and activated automatically when the world has no active scene.</li>
        <li>Safe to re-run after module updates — no duplicates are created.</li>
      </ul>
      <p><em>Note: re-running overwrites documents in place, which resets any playtest state stored on them.</em></p>`,
    buttons: [
      {
        action: 'install',
        label: 'Import / Update Content',
        icon: 'fa-solid fa-file-import',
        default: true,
        callback: () => installContent(),
      },
      {
        action: 'cancel',
        label: 'Cancel',
        icon: 'fa-solid fa-xmark',
      },
    ],
  };
}

/* -------------------------------------------- */
/*  Hooks                                         */
/* -------------------------------------------- */

Hooks.once('init', () => {
  if (!systemIsSupported()) return;

  try {
    game.settings.registerMenu(MODULE_ID, 'installer', {
      name: 'Content Installer',
      label: 'Import / Update Content',
      hint: 'Import this module’s compendium content into this world. Existing documents are overwritten by ID; new documents are added. Run after updating the module.',
      icon: 'fa-solid fa-file-import',
      type: MissionInstaller,
      restricted: true,
    });
    console.log(`${MODULE_ID} | content installer menu registered`);
  } catch (err) {
    console.error(`${MODULE_ID} | failed to register content installer menu`, err);
  }

  // Console/macro escape hatch:
  //   game.modules.get('<module-id>').api.installContent()
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { installContent };
});

Hooks.once('ready', () => {
  if (systemIsSupported()) return;
  const msg = `${game.modules.get(MODULE_ID)?.title ?? MODULE_ID} requires the "${SYSTEM_ID}" game system — this world runs "${game.system.id}" and the module is inactive. Disable it in Manage Modules.`;
  console.warn(`${MODULE_ID} | ${msg}`);
  if (game.user?.isGM) ui.notifications.warn(msg, { permanent: true });
});
